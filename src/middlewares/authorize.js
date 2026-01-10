export const authorize = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized: User context missing' });
            }

            // 1. ADMIN always has access
            if (user.role === 'ADMIN') {
                return next();
            }

            // 2. Check if role is allowed for this endpoint
            if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
                return res.status(403).json({
                    error: `Forbidden: Role ${user.role} does not have access to this resource`
                });
            }

            // 3. Ownership/Agency check is usually handled inside the controller for GET/LIST,
            // but for specific resource access (e.g., DELETE /agent/:id), we use this helper.
            next();
        } catch (error) {
            console.error('[Authorize] Middleware Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
};

/**
 * Helper to check if the user owns a resource OR if the agency owns the user who owns the resource.
 * This should be called inside controllers for granular checks.
 */
export const checkResourceAccess = (user, resource) => {
    if (user.role === 'ADMIN') return true;

    // If user is the owner
    if (resource.ownerId === user.uid) return true;

    // If user is an AGENCY and the resource belongs to one of their managed users
    if (user.role === 'AGENCY' && resource.agencyId === user.uid) return true;

    return false;
};
