def register_email(username: str) -> tuple[str, str]:
    subject = "Chào mừng bạn đến với ThetaMind!"
    body = f"""Xin chào {username},

Cảm ơn bạn đã đăng ký tài khoản tại **ThetaMind**.
ThetaMind là nền tảng học toán trực tuyến hàng đầu, cung cấp các khóa học từ cơ bản đến nâng cao, giúp bạn phát triển kỹ năng toán học một cách toàn diện.
Nếu bạn gặp bất cứ khó khăn nào, hãy liên hệ với chúng tôi qua email hỗ trợ.

Chúc bạn có trải nghiệm học toán thú vị và hiệu quả!

Trân trọng,  
Đội ngũ ThetaMind"""

    return subject, body
