# ManageX API Contracts & Specifications

## 1. Global API Conventions

- **Base Path:** `/api/v1`
- **Content-Type:** `application/json; charset=utf-8`
- **Validation:** Every incoming path parameter, query parameter, and request body is validated via backend Zod schemas.
- **Request Tracing:** All requests generate or preserve a unique `X-Request-Id` UUID, returned in response headers and error payloads.

---

## 2. Standard Envelope Formats

### Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "123e4567-e89b-12d3-a456-426614174000",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 45,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Standard Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The provided payload failed validation.",
    "requestId": "123e4567-e89b-12d3-a456-426614174000",
    "details": [
      {
        "field": "title",
        "message": "Title must be at least 3 characters."
      }
    ]
  }
}
```

### Standard HTTP Status Codes
| Code | Reason | Meaning in ManageX |
|---|---|---|
| `200 OK` | Success | Successful read or idempotent update |
| `201 Created` | Resource Created | Successful creation of a new entity |
| `204 No Content` | Success (No Body) | Successful soft-delete or stateless action |
| `400 Bad Request` | Invalid Input | Malformed JSON or unparseable payload |
| `401 Unauthorized` | Unauthenticated | Missing, expired, or invalid session |
| `403 Forbidden` | Disallowed | Authenticated user lacks permission, or module disabled |
| `404 Not Found` | Not Found | Resource does not exist (or hidden to avoid tenant enumeration) |
| `409 Conflict` | Conflict | Duplicate slug/email, capacity reached, invalid status transition |
| `422 Unprocessable` | Validation Error | Zod schema validation failure on fields |
| `429 Too Many Requests` | Rate Limited | Throttling triggered on public or auth routes |
| `500 Internal Error` | Server Failure | Unexpected exception (stack trace redacted in production) |

---

## 3. Server-Side Pagination Conventions

- Query parameters:
  - `page`: Integer $\ge 1$, default `1`.
  - `limit`: Integer $\ge 1$ and $\le 100$, default `20`.
  - `sort`: Allowlisted field name (e.g. `createdAt`, `dueDate`, `startTime`).
  - `order`: `asc` or `desc`, default `desc`.
- Sorting is strictly validated against an allowlist per endpoint to prevent SQL injection.

---

## 4. Complete Endpoint & Permission Matrix

### A. Authentication & Identity (`/api/v1/auth`)
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | None | Register new user account |
| `POST` | `/api/v1/auth/verify-email` | None | None | Verify email using single-use token |
| `POST` | `/api/v1/auth/login` | None | None | Authenticate credentials & issue session |
| `POST` | `/api/v1/auth/logout` | Session | None | Revoke session & clear cookies |
| `POST` | `/api/v1/auth/forgot-password` | None | None | Request password reset email |
| `POST` | `/api/v1/auth/reset-password` | None | None | Reset password with token & revoke sessions |
| `GET` | `/api/v1/auth/me` | Session | None | Get current authenticated user profile |

### B. Organisation & Membership (`/api/v1/organisations`)
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/organisations` | Session | None | List user's active organisations |
| `POST` | `/api/v1/organisations` | Session | None | Create new organisation (creator becomes Owner) |
| `GET` | `/api/v1/organisations/:orgId` | Session | `org.read` | Get active organisation details |
| `PATCH` | `/api/v1/organisations/:orgId` | Session | `org.update` | Update organisation profile/settings |
| `GET` | `/api/v1/organisations/:orgId/members` | Session | `org.member.read` | List organisation members |
| `POST` | `/api/v1/organisations/:orgId/invitations` | Session | `org.member.invite` | Invite new member by email |
| `POST` | `/api/v1/invitations/:token/accept` | Session | None | Accept invitation to join organisation |
| `PATCH` | `/api/v1/organisations/:orgId/members/:userId` | Session | `org.member.manage` | Update member status or role |
| `POST` | `/api/v1/organisations/:orgId/transfer-owner` | Session | `org.owner.transfer` | Transfer primary ownership (requires reauth) |

### C. Module Catalogue & Activation
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/organisations/:orgId/modules` | Session | `org.read` | View module catalogue & activation state |
| `PATCH` | `/api/v1/organisations/:orgId/modules/:moduleKey` | Session | `org.module.manage` | Activate or deactivate module for organisation |

### D. Events & Hackathons (`/api/v1/organisations/:orgId/events`)
*Requires active module entitlement: `events`*
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/organisations/:orgId/events` | Session | `event.read` | List organisation events (Drafts restricted) |
| `POST` | `/api/v1/organisations/:orgId/events` | Session | `event.create` | Create new event or hackathon |
| `GET` | `/api/v1/organisations/:orgId/events/:eventId` | Session/Public | `event.read` (or public) | Get event details |
| `PATCH` | `/api/v1/organisations/:orgId/events/:eventId` | Session | `event.update` | Update event details |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/status` | Session | `event.status.manage` | Advance lifecycle status |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/register` | Session | `event.register` | Register authenticated user for event |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/withdraw` | Session | `event.register` | Withdraw participant registration |
| `GET` | `/api/v1/organisations/:orgId/events/:eventId/participants` | Session | `event.participant.manage` | View registered participants (Staff only) |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/teams` | Session | `event.team.create` | Create hackathon team |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/submissions` | Session | `event.submission.create`| Submit URL project for judging |
| `GET` | `/api/v1/organisations/:orgId/events/:eventId/judge-work` | Session | `event.judge.evaluate` | View assigned submissions for judge |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/scores` | Session | `event.judge.evaluate` | Submit scores for assigned submission |
| `POST` | `/api/v1/organisations/:orgId/events/:eventId/publish-results`| Session | `event.result.publish` | Review & publish final calculated results |

### E. Meetings (`/api/v1/organisations/:orgId/meetings`)
*Requires active module entitlement: `meetings`*
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/organisations/:orgId/meetings` | Session | `meeting.read` | List upcoming and past meetings |
| `POST` | `/api/v1/organisations/:orgId/meetings` | Session | `meeting.create` | Schedule a meeting with agenda/attendees |
| `GET` | `/api/v1/organisations/:orgId/meetings/:meetingId` | Session | `meeting.read` (attendee) | View meeting details & agenda |
| `PATCH` | `/api/v1/organisations/:orgId/meetings/:meetingId` | Session | `meeting.update` | Update meeting schedule or agenda |
| `POST` | `/api/v1/organisations/:orgId/meetings/:meetingId/status` | Session | `meeting.status.manage` | Update status (in_progress, completed, cancelled) |
| `GET` | `/api/v1/organisations/:orgId/meetings/:meetingId/notes` | Session | `meeting.notes.read` | Read confidential meeting minutes/notes |
| `PUT` | `/api/v1/organisations/:orgId/meetings/:meetingId/notes` | Session | `meeting.notes.manage` | Write/update meeting minutes/notes |
| `POST` | `/api/v1/organisations/:orgId/meetings/:meetingId/action-items`| Session | `meeting.action.manage` | Create action item linked to meeting |
| `PATCH`| `/api/v1/organisations/:orgId/meetings/:meetingId/action-items/:itemId`| Session | `meeting.action.update` | Update action item status or assignee |

### F. Projects & Tasks (`/api/v1/organisations/:orgId/projects`)
*Requires active module entitlement: `projects`*
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/organisations/:orgId/projects` | Session | `project.read` | List visible projects |
| `POST` | `/api/v1/organisations/:orgId/projects` | Session | `project.create` | Create a new project |
| `GET` | `/api/v1/organisations/:orgId/projects/:projectId` | Session | `project.read` | Get project detail & team members |
| `PATCH` | `/api/v1/organisations/:orgId/projects/:projectId` | Session | `project.update` | Update project metadata or lifecycle |
| `GET` | `/api/v1/organisations/:orgId/projects/:projectId/tasks` | Session | `task.read` | List tasks (supports List & Kanban filters) |
| `POST` | `/api/v1/organisations/:orgId/projects/:projectId/tasks` | Session | `task.create` | Create task and assign to project member |
| `PATCH` | `/api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` | Session | `task.update` | Update task details or transition status |
| `DELETE`| `/api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId` | Session | `task.delete` | Soft-delete a task (`deleted_at`) |
| `POST` | `/api/v1/organisations/:orgId/projects/:projectId/tasks/:taskId/comments` | Session | `task.comment.create` | Add comment to a task |
| `GET` | `/api/v1/organisations/:orgId/tasks/my` | Session | `task.read` | Global "Assigned to me", "Due soon", "Overdue" |

### G. Platform Administration (`/api/v1/platform`)
| Method | Endpoint | Auth Required | Permission Key | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/platform/overview` | Platform Session | `platform.overview.read` | Aggregated operational system metrics |
| `GET` | `/api/v1/platform/organisations` | Platform Session | `platform.org.read` | Paginated list of customer organisations |
| `PATCH` | `/api/v1/platform/organisations/:orgId/status` | Platform Session | `platform.org.manage` | Disable/enable organisation status |
| `GET` | `/api/v1/platform/modules` | Platform Session | `platform.module.manage` | Platform availability of modules |
| `GET` | `/api/v1/platform/audit-logs` | Platform Session | `platform.audit.read` | Platform-wide audit history |
