import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Activity, Mail, ArrowRight, ArrowLeft } from 'lucide-react';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await axios.post('/api/auth/forgot-password', { email });
            toast.success('If this email is registered, a recovery link has been sent.');
            setIsSent(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to send recovery email');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-[400px] flex flex-col items-center">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground mb-8 shadow-lg shadow-primary/20">
                    <Activity className="w-8 h-8" />
                </div>

                <h1 className="text-3xl font-bold tracking-tight mb-2">Reset Password</h1>
                <p className="text-muted-foreground mb-8 text-center max-w-[300px]">
                    {isSent
                        ? "Check your email for a link to reset your password. If it doesn't appear within a few minutes, check your spam folder."
                        : "Enter your email address and we'll send you a link to reset your password."}
                </p>

                <div className="w-full bg-card border border-border/50 rounded-xl p-6 shadow-xl shadow-black/5">
                    {!isSent ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                                        placeholder="name@example.com"
                                        required
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-2"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        Send Recovery Link
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="text-center">
                            <button
                                onClick={() => navigate('/login')}
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Return to Login
                            </button>
                        </div>
                    )}

                    {!isSent && (
                        <div className="mt-6 text-center text-sm">
                            <Link to="/login" className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center">
                                <ArrowLeft className="w-3 h-3 mr-1" />
                                Back to login
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
