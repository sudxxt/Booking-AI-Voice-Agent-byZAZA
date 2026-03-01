import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from './AuthContext';
import ChangePasswordModal from '../components/auth/ChangePasswordModal';

interface RequireAuthProps {
    children: JSX.Element;
    allowedRoles?: UserRole[];
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children, allowedRoles }) => {
    const { isAuthenticated, loading, mustChangePassword, user } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Role-based access control
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        // Redirect operators to their specific dashboard if they try to access admin pages
        if (user.role === 'operator') {
            return <Navigate to="/calls" replace />;
        }
        // Fallback for others
        return <Navigate to="/" replace />;
    }

    // Show mandatory password change modal if required
    if (mustChangePassword) {
        return (
            <div className="min-h-screen bg-background">
                <ChangePasswordModal
                    isOpen={true}
                    onClose={() => { }} // No-op - user must change password
                    mandatory={true}
                />
            </div>
        );
    }

    return children;
};
