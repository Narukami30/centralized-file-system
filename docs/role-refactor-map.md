# Role Refactor Mapping

## Current Role Model

- `user`: uploads, own files, own reports/notifications/profile, messaging
- `admin`: branch-scoped management of users/files
- `super_admin`: global management + admin lifecycle + system settings

Role checks are currently inline inside handlers across:

- `routes/auth.js`
- `routes/admin.js`
- `routes/superadmin.js`
- `routes/messages.js` (no explicit role gates, only user existence)

## Current Route-to-Role Mapping

### Public/Auth

- `GET /auth/register` → public
- `POST /auth/register` → public
- `GET /auth/login` → public
- `POST /auth/login` → public

### Dashboard Access

- `GET /auth/user` → `user|admin|super_admin` account existence (currently no strict role == `user`)
- `GET /auth/admin` → `admin|super_admin`
- `GET /auth/super` → `super_admin`
- `GET /admin/dashboard` → `admin|super_admin`
- `GET /superadmin/dashboard` → `super_admin`

### User-Scope Actions

- `POST /auth/upload` → any existing user identity passed via email (intended: owner self-action)
- `GET /auth/reports` → owner self-action
- `GET /auth/reports/data` → owner self-action
- `GET /auth/notifications` → owner self-action
- `POST /auth/file/delete/:fileId` → owner-only (validated by `file.owner === user._id`)
- `POST /auth/user/profile` → owner profile update

### Admin-Scope Actions

- `POST /admin/file/delete/:fileId` → `admin|super_admin` + branch constraint for non-super
- `POST /admin/user/deactivate/:userId` → `admin|super_admin` + branch/role restrictions for non-super
- `POST /admin/user/role` → `super_admin` only
- `GET /admin/files/search` → `admin|super_admin` + branch scoping for non-super

### Super Admin Actions

- `POST /superadmin/admin/create` → `super_admin`
- `POST /superadmin/admin/deactivate/:adminId` → `super_admin`
- `POST /superadmin/admin/reset-password/:adminId` → `super_admin`
- `POST /superadmin/account/reset-password/:accountId` → `super_admin`
- `POST /superadmin/file/delete/:fileId` → `super_admin`
- `POST /superadmin/account/delete/:accountId` → `super_admin`
- `POST /superadmin/settings/update` → `super_admin`

### Messaging

- `POST /messages/send` → authenticated identity implied by email in body (should be hardened)
- `GET /messages/conversation/:withEmail?me=...` → authenticated identity implied by query
- `GET /messages/contacts?me=...` → authenticated identity implied by query
- `POST /messages/presence` → authenticated identity implied by body

## Refactor Target (Recommended)

### 1) Add Shared Guards

- `requireUser` (resolved user exists and active)
- `requireRole(...roles)`
- `requireOwner(getOwnerId)`
- `requireBranchMatch(getBranch)` for admin branch scope

### 2) Stop Trusting Role/Identity in Query/Body

- Move from `?email=` / `req.body.email` authorization to trusted JWT identity (`req.user`)
- Keep email in query/body only for display/filtering, never authorization decisions

### 3) Standardize Route Ownership

- Keep all auth/login/register in `routes/auth.js`
- Keep user self-service under `routes/auth.js` (or split to `routes/user.js`)
- Keep admin-only operations in `routes/admin.js`
- Keep super-admin operations in `routes/superadmin.js`
- Keep messaging in `routes/messages.js` with `requireUser`

### 4) Normalized Role Matrix

- `user`: self files/profile/reports/notifications/messages
- `admin`: everything `user` can do + branch user/file management
- `super_admin`: full global access, cannot accidentally self-delete/demote

## Migration Sequence

1. Introduce middleware guards with no route behavior change.
2. Apply guards route-by-route in `messages`, `admin`, `superadmin`.
3. Move inline role checks into middleware and remove duplicates.
4. Replace query/body identity with JWT identity (flash sessions only for notices).
5. Add route-level authorization tests for each role path.

## Implementation Status (March 3, 2026)

- ✅ Phase 1 completed:
	- Added actor-resolution middleware in [middleware/authMiddleware.js](../middleware/authMiddleware.js)
	- Added role/active/identity-match guards in [middleware/roleMiddleware.js](../middleware/roleMiddleware.js)
	- Wired guards into [routes/admin.js](../routes/admin.js), [routes/superadmin.js](../routes/superadmin.js), and [routes/messages.js](../routes/messages.js)
- ✅ Phase 2 partially completed:
	- Added server-side flash store in [utils/sessionStore.js](../utils/sessionStore.js)
	- Added JWT helper utilities in [utils/jwtAuth.js](../utils/jwtAuth.js)
	- Added cookie-based JWT user resolution + flash middleware in [middleware/sessionMiddleware.js](../middleware/sessionMiddleware.js)
	- Registered global auth/flash middleware in [server.js](../server.js)
	- Updated [routes/auth.js](../routes/auth.js) login/logout to issue/revoke HTTP-only JWT cookie
	- Updated actor resolution to prefer trusted `req.user` in [middleware/authMiddleware.js](../middleware/authMiddleware.js)
	- Updated auth route handlers to use JWT-authenticated identity with query/body fallback removed from protected paths
	- Updated dashboard/logout links to `/auth/logout`
- ⏳ Remaining:
	- Fully remove query/body identity parameters from frontend requests
	- Remove fallback identity paths in route handlers once frontend stops sending identity
	- Add focused authorization tests per role matrix

## Implementation Status Update (JWT + Flash Cutover)

- ✅ Frontend identity params removed from:
	- Dashboard/nav links (`?email=`)
	- Messaging API calls (`fromEmail`, `me`, `email` payload/query)
	- Admin/SuperAdmin action payload identity fields (`email`, `adminEmail`)
	- Profile update forms (no posted identity email)
- ✅ Route guards hardened to session-first in:
	- [routes/admin.js](../routes/admin.js)
	- [routes/superadmin.js](../routes/superadmin.js)
	- [routes/messages.js](../routes/messages.js)
- ✅ `auth` protected handlers now read actor from `req.user` instead of query/body fallbacks.
- ✅ `requireActor` now defaults to strict JWT-authenticated resolution unless explicit `emailFields` are provided.

