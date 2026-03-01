import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # We will use this as a stub for now. 
        # In the future, we can initialize aiosmtplib here using environment variables.
        pass

    async def send_verification_email(self, email: str, token: str):
        # In a real implementation this would compile an HTML template and send via SMTP.
        verification_link = f"http://localhost:3003/verify-email?token={token}"
        
        logger.info(f"========== EMAIL STUB ==========")
        logger.info(f"To: {email}")
        logger.info(f"Subject: Verify your Asterisk AI Voice Agent account")
        logger.info(f"Body: Please click the link to verify your email:")
        logger.info(f"Link: {verification_link}")
        logger.info(f"================================")
        
        # We print it as well so it's visible in the console if logger isn't configured
        print(f"\n[EMAIL] Send Verification Link to {email}: {verification_link}\n")

    async def send_password_reset_email(self, email: str, token: str):
        # In a real implementation this would compile an HTML template and send via SMTP.
        reset_link = f"http://localhost:3003/reset-password?token={token}"
        
        logger.info(f"========== EMAIL STUB ==========")
        logger.info(f"To: {email}")
        logger.info(f"Subject: Password Reset Request")
        logger.info(f"Body: You requested a password reset. Click the link to proceed:")
        logger.info(f"Link: {reset_link}")
        logger.info(f"================================")
        
        print(f"\n[EMAIL] Send Password Reset Link to {email}: {reset_link}\n")

email_service = EmailService()
