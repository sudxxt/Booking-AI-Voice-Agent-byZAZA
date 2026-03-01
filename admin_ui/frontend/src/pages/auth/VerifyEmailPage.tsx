import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Activity, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

const VerifyEmailPage = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
    const [errorMessage, setErrorMessage] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMessage('Verification token is missing from the URL.');
            return;
        }

        const verifyEmail = async () => {
            try {
                await axios.post('/api/auth/verify-email', { token });
                setStatus('success');
            } catch (error: any) {
                setStatus('error');
                setErrorMessage(error.response?.data?.detail || 'Failed to verify email. The token might be invalid or expired.');
            }
        };

        verifyEmail();
    }, [token]);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-[400px] flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground mb-8 shadow-lg shadow-primary/20">
                    <Activity className="w-8 h-8" />
                </div>

                {status === 'verifying' && (
                    <>
                        <h1 className="text-3xl font-bold tracking-tight mb-4">Verifying Email</h1>
                        <div className="flex flex-col items-center space-y-4">
                            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <p className="text-muted-foreground">Please wait while we verify your email address...</p>
                        </div>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight mb-4">Email Verified!</h1>
                        <p className="text-muted-foreground mb-8">
                            Your email address has been successfully verified. You can now use all features of your account.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 py-2 w-full"
                        >
                            Continue to Login
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
                            <XCircle className="w-10 h-10" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight mb-4">Verification Failed</h1>
                        <p className="text-muted-foreground mb-8">
                            {errorMessage}
                        </p>
                        <div className="space-y-4 w-full">
                            <Link
                                to="/login"
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
                            >
                                Return to Login
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default VerifyEmailPage;
