# main.py
import os
import smtplib
from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status, Response
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import sqlite3
import json
import asyncio
from dotenv import load_dotenv
from passlib.context import CryptContext
from typing import Optional
from starlette.requests import Request
from starlette.responses import Response
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware
from urllib.parse import quote, unquote
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np
from typing import List, Optional
import uuid
from datetime import datetime
import re
import time
import io
import base64
from email_helper import register_email

load_dotenv()

# --- Configuration ---
DB = "thetamind.db"
AI_P = os.getenv("AI_PROVIDER", "gemini")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
SECRET_KEY = os.getenv("SECRET_KEY", "a_very_secret_key")

# This is a fallback for when OPENAI is not configured.
# We will use a mock AI response.
if AI_P == "openai":
    IS_AI_CONFIGURED = bool(OPENAI_KEY)

    if IS_AI_CONFIGURED:
        import openai
        openai.api_key = OPENAI_KEY
elif AI_P == "gemini":
    IS_AI_CONFIGURED = bool(GEMINI_KEY)
    if IS_AI_CONFIGURED:
        from google import genai

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="thetamind")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

oauth = OAuth()
oauth.register(
    name='google',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    client_kwargs={'scope': 'openid email profile'}
)

def send_email(to_email: str, subject: str, body: str):
    smtp_app_password = os.getenv("SMTP_APP_PASSWORD")
    smtp_email = os.getenv("SMTP_EMAIL")
    if not smtp_app_password or not smtp_email:
        print("SMTP credentials not set. Skipping email sending.")
        return
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.ehlo()
            server.login(smtp_email, smtp_app_password)
            message = f"From: {smtp_email}\nTo: {to_email}\nSubject: {subject}\n\n{body}"
            server.sendmail(smtp_email, to_email, message)
            print(f"Email sent to {to_email}")
    except Exception as e:
        print(f"Failed to send email: {e}")


# --- Database Initialization ---
def db_init():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT,
        oauth_provider TEXT,
        oauth_id TEXT,
        coins INTEGER DEFAULT 0
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_badges (
        user_id INTEGER NOT NULL,
        badge_id TEXT NOT NULL,
        PRIMARY KEY (user_id, badge_id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_progress (
        user_id INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, node_id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )""")
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS quiz_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        user_id INTEGER NOT NULL, 
        topic TEXT NOT NULL,
        difficulty TEXT NOT NULL, 
        question TEXT NOT NULL, 
        user_solution TEXT,
        is_correct BOOLEAN, 
        ts DATETIME DEFAULT CURRENT_TIMESTAMP, 
        FOREIGN KEY (user_id) REFERENCES users (id)
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        conversation_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL, -- 'user' or 'assistant'
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(conversation_id)
    )
    """)
    conn.commit()
    conn.close()

db_init()

class OCRRequest(BaseModel):
    image_data: str

class OCRResponse(BaseModel):
    text: str
    success: bool
    error: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    message_id: int

# --- User and Session Management ---

def get_user(username: str):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cur.fetchone()
    conn.close()
    return user

def get_current_user(request: Request):
    encoded_username = request.cookies.get("thetamind_user")
    if encoded_username:
        username = unquote(encoded_username)
        return get_user(username)
    return None

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def clean_response(response: str) -> str:
    return response.strip().strip('```json').strip('```')

def get_coins(username: str):
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT coins FROM users WHERE username = ?", (username,))
    result = cur.fetchone()
    conn.close()
    return result[0] if result else 0

def update_user_coins(username: str, coins_delta: int, allow_negative: bool = False) -> int:
    """
    Update user's coin balance and return the new balance
    coins_delta can be positive (add coins) or negative (spend coins)
    """
    # Get current balance first
    current_balance = get_coins(username)
    new_balance = current_balance + coins_delta

    if new_balance < 0 and not allow_negative:
        raise ValueError(f"Insufficient coins. Current: {current_balance}, Attempted: {coins_delta}")
    
    # Update the database
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("""
        UPDATE users 
        SET coins = ? 
        WHERE username = ?
    """, (new_balance, username))
    conn.commit()
    conn.close()
    
    return new_balance

def preprocess_image_for_ocr(image):
    """Enhanced preprocessing for Vietnamese text and math symbols"""
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')
    
    # Convert to numpy array for OpenCV processing
    img_array = np.array(image)
    
    # Different preprocessing approaches for different image types
    
    # Method 1: For clean text
    try:
        # Apply mild Gaussian blur to reduce noise
        img_array = cv2.GaussianBlur(img_array, (1, 1), 0)
        
        # Try different thresholding methods
        # Method A: Adaptive thresholding
        img_thresh = cv2.adaptiveThreshold(
            img_array, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Method B: Otsu's thresholding
        _, img_otsu = cv2.threshold(img_array, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Choose the method that gives more black pixels (likely better for text)
        if np.sum(img_thresh == 0) > np.sum(img_otsu == 0):
            img_array = img_thresh
        else:
            img_array = img_otsu
            
    except Exception as e:
        print(f"Advanced preprocessing failed: {e}")
        # Fallback to simple thresholding
        _, img_array = cv2.threshold(img_array, 128, 255, cv2.THRESH_BINARY)
    
    # Convert back to PIL Image
    image = Image.fromarray(img_array)
    
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    
    return image

def clean_ocr_text(text):
    """Enhanced cleaning for math OCR with LaTeX conversion"""
    # Remove extra whitespace but preserve line breaks for multi-line problems
    text = re.sub(r' +', ' ', text)  # Ensure raw string
    text = re.sub(r'\n\s*\n', '\n', text)  # Ensure raw string
    
    # Common OCR corrections for math symbols with LaTeX equivalents
    replacements = {
        # Basic operators
        '—': '-', '–': '-', '−': '-',
        '×': '\\times', '÷': '\\div', '∗': '*', '⋅': '\\cdot',
        '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx',
        '±': '\\pm', '∓': '\\mp',
        
        # Greek letters
        'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
        'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
        'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
        'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
        'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
        'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
        
        # Capital Greek letters
        'Α': 'A', 'Β': 'B', 'Γ': '\\Gamma', 'Δ': '\\Delta',
        'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Θ': '\\Theta',
        'Ι': 'I', 'Κ': 'K', 'Λ': '\\Lambda', 'Μ': 'M',
        'Ν': 'N', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Ρ': 'P',
        'Σ': '\\Sigma', 'Τ': 'T', 'Υ': '\\Upsilon', 'Φ': '\\Phi',
        'Χ': 'X', 'Ψ': '\\Psi', 'Ω': '\\Omega',
        
        # Math symbols
        '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla',
        '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
        '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',
        '√': '\\sqrt', '∛': '\\sqrt[3]', '∜': '\\sqrt[4]',
        
        # Sets and logic
        '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊃': '\\supset',
        '⊆': '\\subseteq', '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap',
        '∅': '\\emptyset', '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists',
        '∴': '\\therefore', '∵': '\\because',
        
        # Arrows
        '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
        '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
        '↦': '\\mapsto',
        
        # Fractions and brackets
        '½': '\\frac{1}{2}', '⅓': '\\frac{1}{3}', '¼': '\\frac{1}{4}',
        '⅔': '\\frac{2}{3}', '¾': '\\frac{3}{4}',
        '⟨': '\\langle', '⟩': '\\rangle',
        
        # Common OCR mistakes
        'ﬂ': 'fl', 'ﬁ': 'fi', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
        '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'",
    }
    
    for wrong, correct in replacements.items():
        text = text.replace(wrong, correct)
    
    # Convert common math patterns to LaTeX
    text = convert_math_patterns_to_latex(text)
    
    return text.strip()

def preprocess_image_for_vietnamese(image):
    """Enhanced preprocessing specifically for Vietnamese text with math symbols"""
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')
    
    # Convert to numpy array for OpenCV processing
    img_array = np.array(image)
    
    # Simple preprocessing - avoid complex operations that might cause issues
    try:
        # Apply Gaussian blur to reduce noise
        img_array = cv2.GaussianBlur(img_array, (1, 1), 0)
        
        # Use Otsu's thresholding
        _, img_array = cv2.threshold(img_array, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
    except Exception as e:
        print(f"Preprocessing error: {e}")
        # Fallback to simple thresholding
        _, img_array = cv2.threshold(img_array, 128, 255, cv2.THRESH_BINARY)
    
    # Convert back to PIL Image
    image = Image.fromarray(img_array)
    
    # Enhance contrast for better Vietnamese character recognition
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)
    
    return image

def convert_math_patterns_to_latex(text):
    """Convert common math patterns to LaTeX format safely"""
    try:
        # Convert fractions: a/b to \frac{a}{b}
        text = re.sub(r'(\d+)/(\d+)', r'\\frac{\1}{\2}', text)
        
        # Convert exponents: x^2 to x^{2}
        text = re.sub(r'(\w)\^(\d+)', r'\1^{\2}', text)
        
        # Convert subscripts: x_1 to x_{1}
        text = re.sub(r'(\w)_(\d+)', r'\1_{\2}', text)
        
        # Convert square roots: sqrt(x) to \sqrt{x}
        text = re.sub(r'sqrt\(([^)]+)\)', r'\\sqrt{\1}', text)
        
        # Convert common functions - FIXED: use raw strings and word boundaries
        text = re.sub(r'\bsin\b', r'\\sin', text)
        text = re.sub(r'\bcos\b', r'\\cos', text)
        text = re.sub(r'\btan\b', r'\\tan', text)
        text = re.sub(r'\blog\b', r'\\log', text)
        text = re.sub(r'\bln\b', r'\\ln', text)
        text = re.sub(r'\blim\b', r'\\lim', text)
        
        return text
    except Exception as e:
        print(f"LaTeX conversion error: {e}")
        return text  # Return original text if conversion fails

def clean_vietnamese_math_text(text):
    """Enhanced cleaning for Vietnamese text with math symbol preservation"""
    if not text:
        return ""
    
    # Vietnamese character ranges and common diacritics
    vietnamese_chars = r'a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ'
    
    # Preserve Vietnamese characters, math symbols, and common punctuation
    allowed_chars = vietnamese_chars + r'0-9\s\.\,\!\?\:\;\-\+\\=\*\/\(\)\[\]\{\}\^\_\<\>\|\&\$\%\@\#\~'
    
    # Remove unwanted characters but preserve Vietnamese and math
    cleaned_text = re.sub(f'[^{allowed_chars}]', ' ', text)
    
    # Clean up whitespace
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    
    # Common Vietnamese OCR corrections
    vietnamese_corrections = {
        # Common OCR mistakes for Vietnamese
        'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
        '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'",
        '…': '...', '–': '-', '—': '-', '~': '~',
        
        # Vietnamese specific corrections
        'ê': 'ê', 'ô': 'ô', 'ơ': 'ơ', 'ư': 'ư', 'ă': 'ă', 'đ': 'đ',
        'Â': 'Â', 'Ê': 'Ê', 'Ô': 'Ô', 'Ơ': 'Ơ', 'Ư': 'Ư', 'Ă': 'Ă', 'Đ': 'Đ',
    }
    
    for wrong, correct in vietnamese_corrections.items():
        cleaned_text = cleaned_text.replace(wrong, correct)
    
    return cleaned_text.strip()

def format_ocr_output(text):
    """Format OCR output with Markdown and LaTeX support"""
    if not text:
        return ""
    
    lines = text.split('\n')
    formatted_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check if line contains math patterns
        has_math = any(pattern in line for pattern in ['=', '+', '-', '*', '/', '^', '_', 'sqrt', 'frac'])
        
        if has_math:
            # Apply safe LaTeX conversion
            try:
                line = convert_math_patterns_to_latex(line)
                # Wrap math expressions in $ for inline or $$ for block
                if len(line) > 50 or '\n' in line:
                    line = f"$$\n{line}\n$$"
                else:
                    line = f"${line}$"
            except Exception as e:
                print(f"Math formatting error: {e}")
                # Keep original if conversion fails
        
        formatted_lines.append(line)
    
    # Join with Markdown formatting
    formatted_text = '\n\n'.join(formatted_lines)
    
    # Add Markdown header if multiple lines
    if len(formatted_lines) > 1:
        formatted_text = f"**Extracted Text:**\n\n{formatted_text}"
    
    return formatted_text

def format_ocr_output(text):
    """Format OCR output with Markdown and LaTeX support"""
    if not text:
        return ""
    
    lines = text.split('\n')
    formatted_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check if line contains math patterns
        has_math = any(pattern in line for pattern in ['=', '+', '-', '*', '/', '^', '_', 'sqrt', 'frac'])
        
        if has_math:
            # Apply safe LaTeX conversion
            try:
                line = convert_math_patterns_to_latex(line)
                # Wrap math expressions in $ for inline or $$ for block
                if len(line) > 50 or '\n' in line:
                    line = f"$$\n{line}\n$$"
                else:
                    line = f"${line}$"
            except:
                pass  # Keep original if conversion fails
        
        formatted_lines.append(line)
    
    # Join with Markdown formatting
    formatted_text = '\n\n'.join(formatted_lines)
    
    # Add Markdown header if multiple lines
    if len(formatted_lines) > 1:
        formatted_text = f"**Extracted Text:**\n\n{formatted_text}"
    
    return formatted_text

def convert_math_patterns_to_latex(text):
    """Convert common math patterns to LaTeX format"""
    
    # Convert fractions: a/b to \frac{a}{b}
    text = re.sub(r'(\d+)/(\d+)', r'\\frac{\1}{\2}', text)
    
    # Convert exponents: x^2 to x^{2}
    text = re.sub(r'(\w)\^(\d+)', r'\1^{\2}', text)
    
    # Convert subscripts: x_1 to x_{1}
    text = re.sub(r'(\w)_(\d+)', r'\1_{\2}', text)
    
    # Convert square roots: sqrt(x) to \sqrt{x}
    text = re.sub(r'sqrt\(([^)]+)\)', r'\\sqrt{\1}', text)
    
    # Convert common functions
    text = re.sub(r'\bsin\b', '\\sin', text)
    text = re.sub(r'\bcos\b', '\\cos', text)
    text = re.sub(r'\btan\b', '\\tan', text)
    text = re.sub(r'\blog\b', '\\log', text)
    text = re.sub(r'\bln\b', '\\ln', text)
    text = re.sub(r'\blim\b', '\\lim', text)
    
    return text

# ----------AI INTEGRATION----------

async def enhance_image_for_ocr(image):
    """Enhanced image preprocessing for better OCR results"""
    # Convert to numpy array for OpenCV processing
    img_array = np.array(image.convert('RGB'))
    
    # Multiple enhancement techniques
    enhanced_images = []
    
    # 1. Original grayscale
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    enhanced_images.append(('gray', gray))
    
    # 2. Contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    contrast = clahe.apply(gray)
    enhanced_images.append(('contrast', contrast))
    
    # 3. Denoising
    denoised = cv2.fastNlMeansDenoising(gray)
    enhanced_images.append(('denoised', denoised))
    
    # 4. Sharpening
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(gray, -1, kernel)
    enhanced_images.append(('sharpened', sharpened))
    
    # 5. Adaptive threshold
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                   cv2.THRESH_BINARY, 11, 2)
    enhanced_images.append(('adaptive', adaptive))
    
    # Test all enhanced images and choose the best one
    best_image = gray  # default
    max_text_length = 0
    
    for name, enhanced_img in enhanced_images:
        try:
            # Quick OCR test
            test_text = pytesseract.image_to_string(enhanced_img, config='--oem 3 --psm 6')
            if len(test_text.strip()) > max_text_length:
                max_text_length = len(test_text.strip())
                best_image = enhanced_img
        except:
            continue
    
    # Convert back to PIL Image
    return Image.fromarray(best_image)

async def correct_ocr_with_ai(ocr_text):
    """Use AI to correct and enhance OCR results"""
    if not ocr_text.strip():
        return ocr_text
    
    prompt = f"""
    Correct and enhance this OCR-extracted text. The text may contain:
    - Vietnamese language with diacritics
    - Mathematical expressions and symbols
    - OCR errors and misrecognitions
    
    Original OCR text:
    "{ocr_text}"
    
    Please:
    1. Correct any OCR errors
    2. Restore proper Vietnamese diacritics where appropriate
    3. Identify and properly format mathematical expressions
    4. Maintain the original meaning and structure
    5. Return only the corrected text, no explanations
    
    If it's primarily Vietnamese, keep it in Vietnamese.
    If it's primarily math, format mathematical expressions properly.
    """
    
    try:
        corrected = await ai_q(prompt)
        return corrected.strip()
    except Exception as e:
        print(f"AI correction failed: {e}")
        return ocr_text  # Return original if AI fails

async def format_math_text_with_ai(text):
    """Use AI to format text with proper LaTeX for mathematics"""
    if not text.strip():
        return text
    
    # Check if text contains mathematical content
    math_indicators = ['=', '+', '-', '*', '/', '^', 'sqrt', 'frac', '∫', '∑', '∞', '∂']
    has_math = any(indicator in text for indicator in math_indicators)
    
    if not has_math:
        return text  # Return as is if no math detected
    
    prompt = f"""
    Format this text with proper LaTeX for mathematical expressions while preserving any natural language:
    
    "{text}"
    
    Instructions:
    1. Keep Vietnamese text as is
    2. Convert mathematical expressions to proper LaTeX format
    3. Use $ for inline math and $$ for display math
    4. Preserve the original structure and meaning
    5. Don't add any explanations or notes
    
    Examples:
    - "x^2 + 3x + 2 = 0" becomes "$x^2 + 3x + 2 = 0$"
    - "Giải phương trình x^2 - 5x + 6 = 0" becomes "Giải phương trình $x^2 - 5x + 6 = 0$"
    - "∫ from 0 to 1 of x dx" becomes "$\\int_0^1 x  dx$"
    
    Return only the formatted text.
    """
    
    try:
        formatted = await ai_q(prompt)
        return formatted.strip()
    except Exception as e:
        print(f"Math formatting failed: {e}")
        # Fallback: basic LaTeX conversion
        return convert_math_patterns_to_latex(text)

async def generate_chat_title(message: str) -> str:
    """Generate a meaningful title using AI"""
    prompt = f"""
    Create a very short, descriptive title (max 4-5 words) for this chat message:
    "{message}"
    
    Return only the title, no quotes or explanations.
    Make it specific to math if it's a math question.
    """
    
    try:
        title = await ai_q(prompt)
        # Clean up the response
        title = title.strip().strip('"').strip("'")
        if len(title) > 50:
            title = title[:47] + "..."
        return title or message[:50]
    except:
        # Fallback: use first few words of the message
        words = message.split()[:4]
        return ' '.join(words) + ('...' if len(message) > 20 else '')

async def query_ai(prompt: str) -> str:
    """Helper function to call the appropriate AI provider"""
    if IS_AI_CONFIGURED:
        if AI_P == "openai":
            try:
                response = await openai.ChatCompletion.acreate(
                    model="gpt-4-turbo",
                    messages=[{"role": "user", "content": prompt}]
                )
                return response.choices[0].message.content
            except Exception as e:
                print(f"Error calling OpenAI: {e}")
                return f"AI_ERR: {e}"
        elif AI_P == "gemini" and GEMINI_KEY and genai:
            try:
                client = genai.Client(api_key=GEMINI_KEY)
                resp = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt
                )
                return resp.text
            except Exception as e:
                return f"AI_ERR: {e}"

async def ai_q(prompt: str) -> str:
    """Helper function to call the appropriate AI provider"""
    if IS_AI_CONFIGURED:
        return await query_ai(prompt)

    # Fallback for demonstration if no API key is set
    await asyncio.sleep(1)
    if "Generate a single math quiz question" in prompt:
         return json.dumps({
            "question": "If a rectangle has a length of (2x + 1) and a width of (x - 3), what is its area in terms of x?",
            "solution": "To find the area of a rectangle, you multiply its length by its width. Area = (2x + 1)(x - 3). Using the FOIL method: (2x * x) + (2x * -3) + (1 * x) + (1 * -3) = 2x² - 6x + x - 3. Combine like terms to get the final area: 2x² - 5x - 3.",
            "difficulty": "Medium"
        })
    elif "You are an expert AI Math Tutor" in prompt:
        return json.dumps({
            "is_correct": True,
            "feedback": "Great job! Your method of using the distributive property (FOIL) is perfect for this problem. You correctly multiplied the terms and combined the like terms to arrive at the correct answer.",
            "smarter_way": "For this type of problem, the FOIL method is the most direct and efficient way to solve it. Keep up the excellent work!"
        })
    return json.dumps({"error": "AI provider not configured."})


# --- Page Routes ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("index.html", {"request": request, "user": user})

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@app.post("/register")
async def register_user(request: Request, username: str = Form(...), email: str = Form(...), password: str = Form(...)):
    hashed_password = get_password_hash(password)
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO users (username, email, hashed_password) VALUES (?, ?, ?)",
                    (username, email, hashed_password))
        email_subject, email_body = register_email(username)
        send_email(email, email_subject, email_body)
        conn.commit()
    except sqlite3.IntegrityError:
        return templates.TemplateResponse("register.html", {"request": request, "error": "Username or email already exists."})
    finally:
        conn.close()
    return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
async def login_user(request: Request, username: str = Form(...), password: str = Form(...)):
    user = get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid username or password"})
    
    encoded_username = quote(username)
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(key="thetamind_user", value=encoded_username, httponly=True)
    return response

@app.get('/google-login')
async def google_login(request: Request):
    redirect_uri = request.url_for('auth')
    print(redirect_uri)
    return await oauth.google.authorize_redirect(request, str(redirect_uri))

@app.get('/auth')
async def auth(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')
    if user_info:
        conn = sqlite3.connect(DB)
        cur = conn.cursor()
        cur.row_factory = sqlite3.Row
        
        # Check if user already exists in the database
        user = cur.execute("SELECT * FROM users WHERE oauth_provider = 'google' AND oauth_id = ?", (user_info['sub'],)).fetchone()
        
        # If user doesn't exist, insert with a dummy password
        if not user:
            dummy_password = "google_oauth_dummy_password"  # You can use any string here
            hashed_password = get_password_hash(dummy_password)
            cur.execute("INSERT INTO users (username, email, oauth_provider, oauth_id, hashed_password) VALUES (?, ?, 'google', ?, ?)",
                        (user_info['name'], user_info['email'], user_info['sub'], hashed_password))
            email_subject, email_body = register_email(user_info['name'])
            send_email(user_info['email'], email_subject, email_body)
            conn.commit()
        user = cur.execute("SELECT * FROM users WHERE email=?", (user_info['email'],)).fetchone()
        conn.close()

        user_dict = dict(user)
        encoded_username = quote(user_dict['username'])
        response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie(key="thetamind_user", value=encoded_username, httponly=True)
        return response
    
    return response

@app.get("/logout")
async def logout(request: Request):
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie("thetamind_user")
    return response

@app.get("/tools", response_class=HTMLResponse)
async def tools_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("tools.html", {"request": request, "user": user})

TOPIC_WEIGHTS = {
    "Foundations of Algebra": 1.0, "Solving Linear Equations": 1.2, "Inequalities": 1.3,
    "Systems of Equations": 1.5, "Polynomials and Factoring": 1.6, "Quadratic Equations": 1.8,
    "Functions and Graphing": 1.7, "Exponents and Radicals": 1.4
}
DIFFICULTY_MULTIPLIERS = {"Easy": 1, "Medium": 3, "Hard": 5, "Very Hard": 10}
@app.get("/algebra", response_class=HTMLResponse)
async def algebra_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("algebra.html", {"request": request, "user": user})
@app.get("/algebra_challenges", response_class=HTMLResponse)
async def algebra_challenges_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("algebra_challenges.html", {"request": request, "user": user})

@app.get("/api/get_challenge_progress")
async def get_challenge_progress(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # Get completed nodes
    cur.execute("SELECT node_id FROM user_progress WHERE user_id = ?", (user["id"],))
    completed_nodes = [row[0] for row in cur.fetchall()]

    # Define challenge nodes and their prerequisites
    challenge_nodes = {
        'alg_challenge_1': [],
        'alg_challenge_2': ['alg_challenge_1'],
        'alg_challenge_3': ['alg_challenge_2'],
        'alg_challenge_4': ['alg_challenge_2'],
        'alg_challenge_5': ['alg_challenge_4'],
        'alg_challenge_6': ['alg_challenge_5'],
        'alg_challenge_7': ['alg_challenge_5', 'alg_challenge_6'],
        'alg_challenge_8': ['alg_challenge_6'],
        'alg_challenge_9': ['alg_challenge_3', 'alg_challenge_4'],
        'alg_challenge_10': ['alg_challenge_2'],
        'alg_challenge_11': ['alg_challenge_7', 'alg_challenge_8'],
        'alg_challenge_12': ['alg_challenge_11']
    }

    # Calculate unlocked nodes
    unlocked_nodes = []
    for node_id, prerequisites in challenge_nodes.items():
        if all(prereq in completed_nodes for prereq in prerequisites) or node_id == 'alg_challenge_1':
            unlocked_nodes.append(node_id)

    conn.close()

    return JSONResponse(content={
        "completed_nodes": completed_nodes,
        "unlocked_nodes": unlocked_nodes
    })
@app.get("/documentation", response_class=HTMLResponse)
async def route_documentation(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("documentation.html", {"request": request, "user": user})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT topic, difficulty, is_correct, COUNT(*) as count FROM quiz_history WHERE user_id = ? GROUP BY topic, difficulty, is_correct", (user["id"],))
    stats = cur.fetchall()
    conn.close()

    stats_dict = [dict(row) for row in stats]
    
    return templates.TemplateResponse("dashboard.html", {"request": request, "user": user, "stats": stats_dict})


@app.get("/about", response_class=HTMLResponse)
async def about_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("about.html", {"request": request, "user": user})

# --- API Routes ---
@app.get("/api/coin_balance")
async def get_user_coin_balance(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    balance = get_coins(user["username"])
    return JSONResponse(content={"coin_balance": balance})

@app.post("/api/generate_quiz")
async def generate_quiz(request: Request, topic: str = Form(...), difficulty: str = Form(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    prompt = f"Generate a single math quiz question on the topic of '{topic}' with a difficulty of '{difficulty}'. Format the response as a JSON object with keys: 'question', 'solution', 'difficulty'."
    ai_response = await ai_q(prompt)
    ai_response = clean_response(ai_response)
    try:
        return JSONResponse(content=json.loads(ai_response))
    except (json.JSONDecodeError, TypeError):
        return JSONResponse(content={"error": "Failed to generate a valid quiz question from AI."}, status_code=500)

@app.get("/algebra-challenges", response_class=HTMLResponse)
async def algebra_challenges_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("algebra-challenges.html", {"request": request, "user": user})

@app.get("/api/get_challenge_progress")
async def get_challenge_progress(request: Request):
    user = get_current_user(request)
    if not user: return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    prompt = f"""As an expert AI Math Tutor, evaluate a student's work.
    Original Question: "{question}"
    Student's Solution: "{user_solution}"
    Correct Solution: "{correct_solution}"
    Analyze the student's process. Identify misconceptions or errors.
    Provide your evaluation as a JSON object with keys: "is_correct" (boolean), "feedback" (constructive paragraph), "smarter_way" (alternative method or encouragement)."""
    ai_response = await ai_q(prompt)
    ai_response = clean_response(ai_response)

    try:
        evaluation = json.loads(ai_response)
        is_correct = evaluation.get("is_correct", False)
        coins_earned = 0
        if is_correct:
            base_coins = TOPIC_WEIGHTS.get(topic, 1.0)
            multiplier = DIFFICULTY_MULTIPLIERS.get(difficulty, 1)
            coins_earned = int(base_coins * multiplier)

        conn = sqlite3.connect(DB)
        cur = conn.cursor()
        cur.execute("INSERT INTO quiz_history (user_id, topic, difficulty, question, user_solution, is_correct) VALUES (?, ?, ?, ?, ?, ?)",
                    (user["id"], topic, difficulty, question, user_solution, is_correct))
        conn.commit()
        conn.close()
        if coins_earned > 0:
            update_user_coins(user["username"], coins_earned)
        

        evaluation["coins_earned"] = coins_earned
        return JSONResponse(content=evaluation)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse(content={"error": "Failed to get a valid evaluation from AI."}, status_code=500)

@app.post("/api/evaluate_answer")
async def evaluate_answer(request: Request, question: str = Form(...), user_solution: str = Form(...), correct_solution: str = Form(...), topic: str = Form(...), difficulty: str = Form(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    prompt = f"""As an expert AI Math Tutor, evaluate a student's work.
    Original Question: "{question}"
    Student's Solution: "{user_solution}"
    Correct Solution: "{correct_solution}"
    Analyze the student's process. Identify misconceptions or errors.
    Provide your evaluation as a JSON object with keys: "is_correct" (boolean), "feedback" (constructive paragraph), "smarter_way" (alternative method or encouragement)."""
    ai_response = await ai_q(prompt)
    ai_response = clean_response(ai_response)

    try:
        evaluation = json.loads(ai_response)
        is_correct = evaluation.get("is_correct", False)

        if is_correct:
            try:
                if difficulty == "Easy":
                    update_user_coins(user["username"], 5)
                elif difficulty == "Medium":
                    update_user_coins(user["username"], 10)
                elif difficulty == "Hard":
                    update_user_coins(user["username"], 20)
            except ValueError as ve:
                pass

        # Save to database
        conn = sqlite3.connect(DB)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO quiz_history (user_id, topic, difficulty, question, user_solution, is_correct)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user["id"], topic, difficulty, question, user_solution, is_correct))
        conn.commit()
        conn.close()

        return JSONResponse(content=evaluation)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse(content={"error": "Failed to get a valid evaluation from AI."}, status_code=500)


@app.post("/api/buy_hint")
async def buy_hint(request: Request, node_id: str = Form(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    # Generate hint based on node
    hint = generate_hint_for_node(node_id)

    return JSONResponse(content={"success": True, "hint": hint})

def generate_hint_for_node(node_id):
    hints = {
        'alg_challenge_1': "Remember PEMDAS: Parentheses, Exponents, Multiplication/Division, Addition/Subtraction",
        'alg_challenge_2': "Isolate the variable by performing inverse operations on both sides",
        'alg_challenge_3': "When multiplying or dividing by a negative number, flip the inequality sign",
        'alg_challenge_4': "Combine like terms before performing operations",
        'alg_challenge_5': "Look for common factors first, then try grouping or special formulas",
        'alg_challenge_6': "The quadratic formula is x = [-b ± √(b²-4ac)] / 2a",
        'alg_challenge_7': "Check for difference of squares or perfect square trinomials",
        'alg_challenge_8': "The discriminant (b²-4ac) tells you about the nature of the roots",
        'alg_challenge_9': "Try substitution or elimination method for systems of equations",
        'alg_challenge_10': "Define variables for unknown quantities and set up equations from the problem text",
        'alg_challenge_11': "This combines multiple concepts - break it down step by step",
        'alg_challenge_12': "You've made it this far! Use all the techniques you've learned systematically"
    }
    return hints.get(node_id, "Think about the key concepts you've learned for this topic.")

def check_badge_achievements(cur, user_id):
    """Check if user has earned any new badges based on progress"""

    # Get user's completed nodes
    cur.execute("SELECT node_id FROM user_progress WHERE user_id = ?", (user_id,))
    completed_nodes = [row[0] for row in cur.fetchall()]

    badges_earned = []

    # Check for completion badges
    if len(completed_nodes) >= 3:
        badges_earned.append("Algebra Novice")
    if len(completed_nodes) >= 6:
        badges_earned.append("Algebra Apprentice")
    if len(completed_nodes) >= 9:
        badges_earned.append("Algebra Master")
    if len(completed_nodes) == 12:
        badges_earned.append("Algebra Champion")

    # Check for specific achievement badges
    if all(f'alg_challenge_{i}' in completed_nodes for i in [1, 2, 3]):
        badges_earned.append("Linear Specialist")

    if all(f'alg_challenge_{i}' in completed_nodes for i in [4, 5, 7]):
        badges_earned.append("Polynomial Pro")

    # Award new badges
    for badge in badges_earned:
        try:
            cur.execute("INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)", 
                       (user_id, badge))
        except sqlite3.IntegrityError:
            # Badge already awarded
            pass

    return badges_earned[0] if badges_earned else None

@app.get("/api/get_user_stats")
async def get_user_stats(request: Request):
    user = get_current_user(request)
    if not user: return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    conn = sqlite3.connect(DB)
    # Fetch coins from the user row directly
    coins = get_coins(user["username"])
    # Fetch badges
    badges_raw = conn.execute("SELECT badge_id FROM user_badges WHERE user_id = ?", (user['id'],)).fetchall()
    conn.close()

    badges = [b[0] for b in badges_raw]
    return JSONResponse(content={"coins": coins, "badges": badges})
@app.post("/api/evaluate_challenge")
async def evaluate_challenge(request: Request, 
                           question: str = Form(...), 
                           user_solution: str = Form(...), 
                           correct_solution: str = Form(...),
                           topic: str = Form(...),
                           difficulty: str = Form(...),
                           node_id: str = Form(...)):
    user = get_current_user(request)
    print("what")
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)

    # Use the same AI evaluation as before
    prompt = f"""As an expert AI Math Tutor, evaluate a student's work.
    Original Question: "{question}"
    Student's Solution: "{user_solution}"
    Correct Solution: "{correct_solution}"
    Analyze the student's process. Identify misconceptions or errors.
    Provide your evaluation as a JSON object with keys: "is_correct" (boolean), "feedback" (constructive paragraph), "smarter_way" (alternative method or encouragement)."""
    
    ai_response = await ai_q(prompt)
    ai_response = clean_response(ai_response)
    print(f"Received AI response: {ai_response}")
    try:
        evaluation = json.loads(ai_response)
        is_correct = evaluation.get("is_correct", False)
        exp_earned = 0
        badge_earned = None

        conn = sqlite3.connect(DB)
        cur = conn.cursor()

        if is_correct:
            # Calculate coins earned
            base_coins = TOPIC_WEIGHTS.get(topic, 1.0)
            multiplier = DIFFICULTY_MULTIPLIERS.get(difficulty, 1)
            exp_earned = int(base_coins * multiplier)

            # Mark node as completed if not already
            try:
                cur.execute("INSERT INTO user_progress (user_id, node_id) VALUES (?, ?)", 
                           (user["id"], node_id))
                
                # Update coins
                conn.commit()
                conn.close()
                update_user_coins(user["username"], exp_earned)
                conn = sqlite3.connect(DB)
                cur = conn.cursor()
                # Check for badge achievements
                badge_earned = check_badge_achievements(cur, user["id"])
                
            except sqlite3.IntegrityError:
                # Node already completed
                pass

        # Log the attempt
        cur.execute("INSERT INTO quiz_history (user_id, topic, difficulty, question, user_solution, is_correct) VALUES (?, ?, ?, ?, ?, ?)",
                   (user["id"], topic, difficulty, question, user_solution, is_correct))
        
        conn.commit()
        conn.close()
        
        evaluation["exp_earned"] = exp_earned
        if badge_earned:
            evaluation["badge_earned"] = badge_earned
            
        return JSONResponse(content=evaluation)
        
    except (json.JSONDecodeError, TypeError):
        return JSONResponse(content={"error": "Failed to get a valid evaluation from AI."}, status_code=500)

@app.post("/api/buy_hint")
async def buy_hint(request: Request, node_id: str = Form(...), coins: int = Form(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    
    # Check user has enough coins
    user_coins = get_coins(user["username"])
    
    if user_coins < coins:
        conn.close()
        return JSONResponse(content={"error": "Not enough coins"}, status_code=400)
    
    # Deduct coins
    update_user_coins(user["username"], -coins)
    
    # Generate hint based on node
    hint = generate_hint_for_node(node_id)
    
    conn.commit()
    conn.close()
    
    return JSONResponse(content={"success": True, "hint": hint})

def generate_hint_for_node(node_id):
    hints = {
        'alg_challenge_1': "Remember PEMDAS: Parentheses, Exponents, Multiplication/Division, Addition/Subtraction",
        'alg_challenge_2': "Isolate the variable by performing inverse operations on both sides",
        'alg_challenge_3': "When multiplying or dividing by a negative number, flip the inequality sign",
        'alg_challenge_4': "Combine like terms before performing operations",
        'alg_challenge_5': "Look for common factors first, then try grouping or special formulas",
        'alg_challenge_6': "The quadratic formula is x = [-b ± √(b²-4ac)] / 2a",
        'alg_challenge_7': "Check for difference of squares or perfect square trinomials",
        'alg_challenge_8': "The discriminant (b²-4ac) tells you about the nature of the roots",
        'alg_challenge_9': "Try substitution or elimination method for systems of equations",
        'alg_challenge_10': "Define variables for unknown quantities and set up equations from the problem text",
        'alg_challenge_11': "This combines multiple concepts - break it down step by step",
        'alg_challenge_12': "You've made it this far! Use all the techniques you've learned systematically"
    }
    return hints.get(node_id, "Think about the key concepts you've learned for this topic.")

def check_badge_achievements(cur, user_id):
    """Check if user has earned any new badges based on progress"""
    
    # Get user's completed nodes
    cur.execute("SELECT node_id FROM user_progress WHERE user_id = ?", (user_id,))
    completed_nodes = [row[0] for row in cur.fetchall()]
    
    badges_earned = []
    
    # Check for completion badges
    if len(completed_nodes) >= 5:
        badges_earned.append("Algebra Explorer")
    if len(completed_nodes) >= 15:
        badges_earned.append("Algebra Adventurer")
    if len(completed_nodes) >= 25:
        badges_earned.append("Algebra Specialist")
    if len(completed_nodes) >= 35:
        badges_earned.append("Algebra Expert")
    if len(completed_nodes) >= 45:
        badges_earned.append("Algebra Master")
    if len(completed_nodes) == 50:
        badges_earned.append("Algebra Grand Master")
    
    # Check for path completion badges
    foundation_nodes = [f'alg_challenge_{i}' for i in range(1, 11)]
    if all(node in completed_nodes for node in foundation_nodes):
        badges_earned.append("Foundation Master")
    
    polynomial_nodes = [f'alg_challenge_{i}' for i in range(17, 29)]
    if all(node in completed_nodes for node in polynomial_nodes):
        badges_earned.append("Polynomial Prodigy")
    
    quadratic_nodes = [f'alg_challenge_{i}' for i in range(29, 39)]
    if all(node in completed_nodes for node in quadratic_nodes):
        badges_earned.append("Quadratic Champion")
    
    # Check for difficulty badges
    hard_nodes = [node for node in completed_nodes if any(f'alg_challenge_{i}' == node for i in [*range(9, 16), *range(23, 29), *range(34, 39), *range(39, 51)])]
    if len(hard_nodes) >= 10:
        badges_earned.append("Challenge Conqueror")
    
    # Speed badges (you might want to track completion timestamps for these)
    # For now, we'll just check if they completed first 10 nodes
    first_ten = [f'alg_challenge_{i}' for i in range(1, 11)]
    if all(node in completed_nodes for node in first_ten):
        badges_earned.append("Quick Starter")
    
    # Award new badges
    for badge in badges_earned:
        try:
            cur.execute("INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)", 
                       (user_id, badge))
        except sqlite3.IntegrityError:
            # Badge already awarded
            pass
    
    return badges_earned[0] if badges_earned else None

@app.get("/api/get_user_stats")
async def get_user_stats(request: Request):
    user = get_current_user(request)
    if not user: return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB)
    # Fetch coins from the user row directly
    coins = get_coins(user["username"])
    # Fetch badges
    badges_raw = conn.execute("SELECT badge_id FROM user_badges WHERE user_id = ?", (user['id'],)).fetchall()
    conn.close()

    badges = [b[0] for b in badges_raw]
    return JSONResponse(content={"coins": coins, "badges": badges})

@app.post("/api/chat/send")
async def send_chat_message(chat_request: ChatRequest, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    try:
        conn = sqlite3.connect(DB)
        cur = conn.cursor()
        
        # Create new conversation if needed
        if not chat_request.conversation_id:
            conversation_id = str(uuid.uuid4())
            # Use AI to generate better title
            title = await generate_chat_title(chat_request.message)
            cur.execute(
                "INSERT INTO chat_conversations (user_id, conversation_id, title) VALUES (?, ?, ?)",
                (user["id"], conversation_id, title)
            )
        else:
            conversation_id = chat_request.conversation_id
            # Update conversation timestamp
            cur.execute(
                "UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
                (conversation_id,)
            )
        
        # Save user message
        cur.execute(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, "user", chat_request.message)
        )
        user_message_id = cur.lastrowid
        
        # Get conversation history for context
        cur.execute(
            "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 10",
            (conversation_id,)
        )
        history = cur.fetchall()
        
        # Build context from history
        context_messages = []
        for role, content in history:
            context_messages.append({"role": role, "content": content})
        
        # Enhanced math tutoring prompt
        math_prompt = (
            "You are an expert math tutor. The user asks: "
            f"\"{chat_request.message}\"\n\n"
            "Please provide a comprehensive, step-by-step explanation. Follow these guidelines:\n\n"
            "1. **Understand the Problem**: Restate the problem in your own words\n"
            "2. **Step-by-Step Solution**: Break it down into logical, numbered steps\n"
            "3. **Mathematical Notation**: Use proper LaTeX for all mathematical expressions\n"
            "4. **Key Concepts**: Explain the underlying principles and why each step works\n"
            "5. **Final Answer**: Clearly state the final answer\n"
            "6. **Verification**: Suggest how to verify the answer\n"
            "7. **Related Practice**: Mention related problems for practice\n\n"
            "Format your response using markdown with:\n"
            "- **Bold** for important concepts\n"
            "- `inline code` for mathematical variables\n"
            "- $$ for block equations (e.g., $$x = \\frac{{-b \\pm \\sqrt{{b^2 - 4ac}}}}{{2a}}$$)\n"
            "- $ for inline equations (e.g., $x^2 + y^2 = z^2$)\n"
            "- Bullet points for steps and explanations\n"
            "- Tables for comparing methods when appropriate\n\n"
            "Be encouraging, patient, and focus on building understanding rather than just giving answers."
        )


        # Include conversation history for context
        messages = [{"role": "system", "content": math_prompt}]
        for msg in context_messages:
            messages.append({"role": msg["role"], "content": msg["content"]})
        
        # Use the last message as the current prompt
        final_prompt = "\n\n".join([msg["content"] for msg in messages])
        
        ai_response = await ai_q(final_prompt)
        
        # Save AI response
        cur.execute(
            "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, "assistant", ai_response)
        )
        ai_message_id = cur.lastrowid
        
        conn.commit()
        conn.close()
        
        return JSONResponse(content={
            "response": ai_response,
            "conversation_id": conversation_id,
            "message_id": ai_message_id
        })
        
    except Exception as e:
        print(f"Chat error: {str(e)}")
        return JSONResponse(content={"error": "Failed to process message"}, status_code=500)

# Enhanced OCR endpoint with Vietnamese and math support
@app.post("/api/ocr/extract-text", response_model=OCRResponse)
async def extract_text_from_image(request: OCRRequest):
    try:
        # Remove data URL prefix if present
        if ',' in request.image_data:
            image_data = request.image_data.split(',')[1]
        else:
            image_data = request.image_data
            
        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        print(f"Image info: {image}")  # Debug log
        
        # Get image dimensions for quality assessment
        width, height = image.size
        if width < 100 or height < 100:
            return OCRResponse(text="", success=False, error="Image too small for OCR")
        
        # Enhanced preprocessing for different image types
        processed_image = await enhance_image_for_ocr(image)
        
        # Try multiple OCR strategies
        ocr_results = []
        
        # Strategy 1: Vietnamese + English
        try:
            text_vie = pytesseract.image_to_string(processed_image, lang='vie+eng', config='--oem 3 --psm 6')
            if text_vie.strip():
                ocr_results.append(('vie+eng', text_vie))
        except Exception as e:
            print(f"Vietnamese OCR failed: {e}")
        
        # Strategy 2: English only
        try:
            text_eng = pytesseract.image_to_string(processed_image, lang='eng', config='--oem 3 --psm 6')
            if text_eng.strip():
                ocr_results.append(('eng', text_eng))
        except Exception as e:
            print(f"English OCR failed: {e}")
        
        # Strategy 3: Multiple PSM modes
        psm_modes = [3, 4, 6, 8, 11]
        for psm in psm_modes:
            try:
                text_psm = pytesseract.image_to_string(processed_image, config=f'--oem 3 --psm {psm}')
                if text_psm.strip() and len(text_psm) > 10:  # Only consider substantial results
                    ocr_results.append((f'psm_{psm}', text_psm))
            except Exception as e:
                continue
        
        # Choose the best result (longest text usually means better recognition)
        best_text = ""
        if ocr_results:
            # Sort by length (longer text usually means better recognition)
            ocr_results.sort(key=lambda x: len(x[1]), reverse=True)
            best_text = ocr_results[0][1]
            print(f"Best OCR result from {ocr_results[0][0]}: {best_text[:100]}...")
        else:
            # Fallback: simple OCR
            best_text = pytesseract.image_to_string(processed_image)
        
        # AI-powered text correction and enhancement
        corrected_text = await correct_ocr_with_ai(best_text)
        
        # Format with proper LaTeX and Markdown
        formatted_text = await format_math_text_with_ai(corrected_text)
        
        return OCRResponse(text=formatted_text, success=True)
        
    except Exception as e:
        print(f"OCR Error: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
        return OCRResponse(text="", success=False, error=str(e))

@app.get("/api/chat/conversations")
async def get_user_conversations(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT conversation_id, title, created_at, updated_at 
        FROM chat_conversations 
        WHERE user_id = ? 
        ORDER BY updated_at DESC
    """, (user["id"],))
    
    conversations = []
    for row in cur.fetchall():
        conversations.append({
            "conversation_id": row[0],
            "title": row[1],
            "created_at": row[2],
            "updated_at": row[3]
        })
    
    conn.close()
    return JSONResponse(content={"conversations": conversations})

@app.get("/api/chat/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    # Verify user owns this conversation
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM chat_conversations WHERE conversation_id = ? AND user_id = ?",
        (conversation_id, user["id"])
    )
    
    if not cur.fetchone():
        conn.close()
        return JSONResponse(content={"error": "Conversation not found"}, status_code=404)
    
    # Get messages
    cur.execute("""
        SELECT role, content, created_at 
        FROM chat_messages 
        WHERE conversation_id = ? 
        ORDER BY created_at ASC
    """, (conversation_id,))
    
    messages = []
    for row in cur.fetchall():
        messages.append({
            "role": row[0],
            "content": row[1],
            "timestamp": row[2]
        })
    
    conn.close()
    return JSONResponse(content={"messages": messages})

@app.delete("/api/chat/conversation/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    
    # Verify ownership and delete
    cur.execute(
        "DELETE FROM chat_conversations WHERE conversation_id = ? AND user_id = ?",
        (conversation_id, user["id"])
    )
    
    if cur.rowcount > 0:
        # Also delete associated messages
        cur.execute("DELETE FROM chat_messages WHERE conversation_id = ?", (conversation_id,))
    
    conn.commit()
    conn.close()
    
    return JSONResponse(content={"success": True})

# AI Solver Endpoint (enhanced with OCR support)
@app.post("/api/solve-problem")
async def solve_problem(request: Request, problem_text: str = Form(None), image_data: str = Form(None)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(content={"error": "Authentication required"}, status_code=401)
    
    try:
        # Handle OCR if image is provided
        if image_data and not problem_text:
            ocr_response = await extract_text_from_image(OCRRequest(image_data=image_data))
            if ocr_response.success:
                problem_text = ocr_response.text
            else:
                return JSONResponse(content={"error": "Failed to extract text from image"}, status_code=400)
        
        if not problem_text:
            return JSONResponse(content={"error": "No problem provided"}, status_code=400)
        
        prompt = f"""Solve this math problem step by step: {problem_text}

Please provide a comprehensive solution with:
1. Understanding the problem
2. Step-by-step solution
3. Final answer
4. Explanation of key concepts

Use markdown formatting and mathematical notation where appropriate."""

        solution = await ai_q(prompt)
        
        return JSONResponse(content={
            "problem": problem_text,
            "solution": solution,
            "used_ocr": bool(image_data)
        })
        
    except Exception as e:
        print(f"Solve problem error: {str(e)}")
        return JSONResponse(content={"error": "Failed to solve problem"}, status_code=500)

# Add chat route
@app.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("chat.html", {"request": request, "user": user})


@app.get("/coming_soon", response_class=HTMLResponse)
async def coming_soon_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("coming_soon.html", {"request": request, "user": user})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
