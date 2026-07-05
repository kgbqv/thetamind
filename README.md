# thetamind

ThetaMind — AI Math Tutor prototype

Vid demo : https://youtube.com/shorts/BLH2ZLt2yfs?feature=share

## Setup

1. Cài Tesseract trên máy bạn  
2. Tạo virtual environment & cài dependencies:  
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Đặt biến môi trường API keys  
   ```
   export OPENAI_API_KEY="your_key"
   export GEMINI_API_KEY="your_key"
   ```

4. Chạy ứng dụng  
   ```
   uvicorn main:app --reload
   ```

5. Mở trình duyệt đến http://127.0.0.1:8000  
