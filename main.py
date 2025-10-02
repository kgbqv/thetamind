# main.py
import os
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

load_dotenv()

# --- Configuration ---
DB = "thetamind.db"
AI_P = os.getenv("AI_PROVIDER", "openai")
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
        oauth_id TEXT
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
    conn.commit()
    conn.close()

db_init()

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


# ----------AI INTEGRATION----------

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
@app.get("/algebra-challenges", response_class=HTMLResponse)
async def algebra_challenges_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("algebra-challenges.html", {"request": request, "user": user})

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
        if coins_earned > 0:
            cur.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (coins_earned, user["id"]))
        conn.commit()
        conn.close()

        evaluation["coins_earned"] = coins_earned
        return JSONResponse(content=evaluation)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse(content={"error": "Failed to get a valid evaluation from AI."}, status_code=500)

@app.post("/api/evaluate_challenge")
async def evaluate_challenge(request: Request, 
                           question: str = Form(...), 
                           user_solution: str = Form(...), 
                           correct_solution: str = Form(...),
                           topic: str = Form(...),
                           difficulty: str = Form(...),
                           node_id: str = Form(...)):
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

@app.post("/api/evaluate_answer")
async def evaluate_answer(request: Request, question: str = Form(...), user_solution: str = Form(...), correct_solution: str = Form(...), topic: str = Form(...), difficulty: str = Form(...)):
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
        if is_correct:
            # Calculate coins earned
            base_coins = TOPIC_WEIGHTS.get(topic, 1.0)
            multiplier = DIFFICULTY_MULTIPLIERS.get(difficulty, 1)
            coins_earned = int(base_coins * multiplier)

            # Mark node as completed if not already
            try:
                cur.execute("INSERT INTO user_progress (user_id, node_id) VALUES (?, ?)", 
                           (user["id"], node_id))

                # Update coins
                cur.execute("UPDATE users SET coins = coins + ? WHERE id = ?", 
                           (coins_earned, user["id"]))

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
    cur.execute("SELECT coins FROM users WHERE id = ?", (user["id"],))
    user_coins = cur.fetchone()[0]

    if user_coins < coins:
        conn.close()
        return JSONResponse(content={"error": "Not enough coins"}, status_code=400)

    # Deduct coins
    cur.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (coins, user["id"]))

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
    coins = conn.execute("SELECT coins FROM users WHERE id = ?", (user['id'],)).fetchone()[0]
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
    
    try:
        evaluation = json.loads(ai_response)
        is_correct = evaluation.get("is_correct", False)
        coins_earned = 0
        badge_earned = None

        conn = sqlite3.connect(DB)
        cur = conn.cursor()

        if is_correct:
            # Calculate coins earned
            base_coins = TOPIC_WEIGHTS.get(topic, 1.0)
            multiplier = DIFFICULTY_MULTIPLIERS.get(difficulty, 1)
            coins_earned = int(base_coins * multiplier)

            # Mark node as completed if not already
            try:
                cur.execute("INSERT INTO user_progress (user_id, node_id) VALUES (?, ?)", 
                           (user["id"], node_id))
                
                # Update coins
                cur.execute("UPDATE users SET coins = coins + ? WHERE id = ?", 
                           (coins_earned, user["id"]))
                
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
        
        evaluation["coins_earned"] = coins_earned
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
    cur.execute("SELECT coins FROM users WHERE id = ?", (user["id"],))
    user_coins = cur.fetchone()[0]
    
    if user_coins < coins:
        conn.close()
        return JSONResponse(content={"error": "Not enough coins"}, status_code=400)
    
    # Deduct coins
    cur.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (coins, user["id"]))
    
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
    coins = conn.execute("SELECT coins FROM users WHERE id = ?", (user['id'],)).fetchone()[0]
    # Fetch badges
    badges_raw = conn.execute("SELECT badge_id FROM user_badges WHERE user_id = ?", (user['id'],)).fetchall()
    conn.close()

    badges = [b[0] for b in badges_raw]
    return JSONResponse(content={"coins": coins, "badges": badges})


@app.get("/coming_soon", response_class=HTMLResponse)
async def coming_soon_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("coming_soon.html", {"request": request, "user": user})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
