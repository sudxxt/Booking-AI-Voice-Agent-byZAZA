import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ConfirmDialogProvider } from './hooks/useConfirmDialog';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import CallHistoryPage from './pages/CallHistoryPage';
import CallSchedulingPage from './pages/CallSchedulingPage';
import axios from 'axios';

// Auth
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';

// Core Configuration Pages
import ProvidersPage from './pages/ProvidersPage';
import PipelinesPage from './pages/PipelinesPage';
import ContextsPage from './pages/ContextsPage';
import ProfilesPage from './pages/ProfilesPage';
import ToolsPage from './pages/ToolsPage';
import MCPPage from './pages/MCPPage';

// Advanced Configuration Pages
import VADPage from './pages/Advanced/VADPage';
import StreamingPage from './pages/Advanced/StreamingPage';
import LLMPage from './pages/Advanced/LLMPage';
import TransportPage from './pages/Advanced/TransportPage';
import BargeInPage from './pages/Advanced/BargeInPage';

// System Pages (eagerly loaded)
import EnvPage from './pages/System/EnvPage';
import DockerPage from './pages/System/DockerPage';

// Help
import HelpPage from './pages/HelpPage';

// Lazy-loaded heavy pages (code-splitting for better initial load)
const Wizard = lazy(() => import('./pages/Wizard'));
const RawYamlPage = lazy(() => import('./pages/Advanced/RawYamlPage'));
const LogsPage = lazy(() => import('./pages/System/LogsPage'));
const TerminalPage = lazy(() => import('./pages/System/TerminalPage'));
const ModelsPage = lazy(() => import('./pages/System/ModelsPage'));
const AsteriskPage = lazy(() => import('./pages/System/AsteriskPage'));

// Loading fallback for lazy-loaded pages
const PageLoader = () => (
    <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
);

// Auth/Setup Guard
const SetupGuard = ({ children }: { children: React.ReactNode }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        let mounted = true;

        const checkStatus = async () => {
            try {
                // Add timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const res = await axios.get('/api/wizard/status', {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (mounted) {
                    // If not configured and not already on wizard, redirect
                    if (!res.data.configured && location.pathname !== '/wizard') {
                        navigate('/wizard');
                    }
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to check setup status', err);
                if (mounted) {
                    // If API fails, we assume not configured or backend down
                    // But we shouldn't block the UI entirely
                    setError('Failed to connect to backend API');
                    setLoading(false);
                }
            }
        };

        checkStatus();

        return () => {
            mounted = false;
        };
    }, [navigate, location.pathname]);

    if (loading) {
        console.log("SetupGuard: loading");
        return (
            <div className="min-h-screen flex items-center justify-center flex-col gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground text-sm">Connecting to system...</p>
            </div>
        );
    }

    if (error && location.pathname !== '/wizard') {
        console.warn("Rendering app despite setup check failure:", error);
    }

    console.log("SetupGuard: rendering children");
    return <>{children}</>;
};

function App() {
    return (
        <AuthProvider>
            <ConfirmDialogProvider>
                <Toaster position="top-right" richColors closeButton />
                <Router>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/reset-password" element={<ResetPasswordPage />} />
                        <Route path="/verify-email" element={<VerifyEmailPage />} />

                        <Route path="*" element={
                            <RequireAuth>
                                <SetupGuard>
                                    <Suspense fallback={<PageLoader />}>
                                        <Routes>
                                            {/* Setup Wizard Route (lazy) */}
                                            <Route path="/wizard" element={<Wizard />} />

                                            {/* Main Application Layout */}
                                            <Route element={<AppShell />}>
                                                <Route path="/" element={<RequireAuth allowedRoles={['owner', 'manager']}><Dashboard /></RequireAuth>} />
                                                <Route path="/history" element={<RequireAuth allowedRoles={['owner', 'manager', 'operator']}><CallHistoryPage /></RequireAuth>} />
                                                <Route path="/scheduling" element={<RequireAuth allowedRoles={['owner', 'manager']}><CallSchedulingPage /></RequireAuth>} />

                                                {/* Core Configuration */}
                                                <Route path="/providers" element={<RequireAuth allowedRoles={['owner', 'manager']}><ProvidersPage /></RequireAuth>} />
                                                <Route path="/pipelines" element={<RequireAuth allowedRoles={['owner', 'manager']}><PipelinesPage /></RequireAuth>} />
                                                <Route path="/contexts" element={<RequireAuth allowedRoles={['owner', 'manager']}><ContextsPage /></RequireAuth>} />
                                                <Route path="/profiles" element={<RequireAuth allowedRoles={['owner', 'manager']}><ProfilesPage /></RequireAuth>} />
                                                <Route path="/tools" element={<RequireAuth allowedRoles={['owner', 'manager']}><ToolsPage /></RequireAuth>} />
                                                <Route path="/mcp" element={<RequireAuth allowedRoles={['owner', 'manager']}><MCPPage /></RequireAuth>} />

                                                {/* Advanced Settings */}
                                                <Route path="/vad" element={<RequireAuth allowedRoles={['owner', 'manager']}><VADPage /></RequireAuth>} />
                                                <Route path="/streaming" element={<RequireAuth allowedRoles={['owner', 'manager']}><StreamingPage /></RequireAuth>} />
                                                <Route path="/llm" element={<RequireAuth allowedRoles={['owner', 'manager']}><LLMPage /></RequireAuth>} />
                                                <Route path="/transport" element={<RequireAuth allowedRoles={['owner', 'manager']}><TransportPage /></RequireAuth>} />
                                                <Route path="/barge-in" element={<RequireAuth allowedRoles={['owner', 'manager']}><BargeInPage /></RequireAuth>} />
                                                <Route path="/yaml" element={<RequireAuth allowedRoles={['owner', 'manager']}><RawYamlPage /></RequireAuth>} />

                                                {/* System Management */}
                                                <Route path="/env" element={<RequireAuth allowedRoles={['owner', 'manager']}><EnvPage /></RequireAuth>} />
                                                <Route path="/docker" element={<RequireAuth allowedRoles={['owner', 'manager']}><DockerPage /></RequireAuth>} />
                                                <Route path="/asterisk" element={<RequireAuth allowedRoles={['owner', 'manager']}><AsteriskPage /></RequireAuth>} />
                                                <Route path="/logs" element={<RequireAuth allowedRoles={['owner', 'manager']}><LogsPage /></RequireAuth>} />
                                                <Route path="/terminal" element={<RequireAuth allowedRoles={['owner', 'manager']}><TerminalPage /></RequireAuth>} />
                                                <Route path="/models" element={<RequireAuth allowedRoles={['owner', 'manager']}><ModelsPage /></RequireAuth>} />

                                                {/* Help */}
                                                <Route path="/help" element={<RequireAuth allowedRoles={['owner', 'manager', 'operator']}><HelpPage /></RequireAuth>} />

                                                {/* Fallback */}
                                                <Route path="*" element={<Navigate to="/" replace />} />
                                            </Route>
                                        </Routes>
                                    </Suspense>
                                </SetupGuard>
                            </RequireAuth>
                        } />
                    </Routes>
                </Router>
            </ConfirmDialogProvider>
        </AuthProvider>
    );
}

export default App;
