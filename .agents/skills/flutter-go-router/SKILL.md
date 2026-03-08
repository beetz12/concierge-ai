---
name: flutter-go-router
description: Diagnose and fix Flutter go_router assertion errors - parentNavigatorKey conflicts, ShellRoute navigation issues, full-screen vs tab navigation patterns
---

# Flutter go_router Debugging Skill

Diagnose and fix Flutter go_router routing errors, especially the `parentNavigatorKey` assertion failure that crashes apps on launch. This is a common issue when using ShellRoute for bottom navigation with full-screen detail screens.

## When to Use

- App crashes immediately after launch with go_router assertion error
- Error mentions `parentNavigatorKey` must be null or match parent's key
- Using ShellRoute for bottom tab navigation
- Detail screens should appear full-screen (without bottom nav) but cause crashes
- Route structure has nested routes with `parentNavigatorKey`

## Quick Diagnosis

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| `route.parentNavigatorKey == null \|\| route.parentNavigatorKey == navigatorKey` | Sub-route inside ShellRoute has different `parentNavigatorKey` | Move route outside ShellRoute, remove `parentNavigatorKey` |
| App crashes on launch with assertion failure | Route hierarchy mismatch | Restructure routes: tabs IN ShellRoute, detail screens OUTSIDE |
| Full-screen routes show bottom nav | Route inside ShellRoute but should be outside | Move to root level routes array |
| Navigation works but shows wrong navigator | Conflicting navigator keys | Use single navigator key strategy |

---

## The Core Problem

### Error Message
```
'package:go_router/src/route.dart':
Failed assertion: line 468 pos 11:
'route.parentNavigatorKey == null || route.parentNavigatorKey == navigatorKey':
sub-route's parent navigator key must either be null or has the same navigator key as parent's key
```

### Why It Happens

When you have:
1. A `ShellRoute` with `navigatorKey: shellNavigatorKey`
2. Sub-routes inside that ShellRoute with `parentNavigatorKey: rootNavigatorKey`

The keys don't match! go_router enforces that sub-routes must either:
- Have no `parentNavigatorKey` (null)
- Have the SAME key as their parent's `navigatorKey`

---

## The Incorrect Pattern (Causes Crash)

```dart
final rootNavigatorKey = GlobalKey<NavigatorState>();
final shellNavigatorKey = GlobalKey<NavigatorState>();

GoRouter(
  navigatorKey: rootNavigatorKey,
  routes: [
    ShellRoute(
      navigatorKey: shellNavigatorKey,  // Shell uses shellNavigatorKey
      builder: (context, state, child) => MainShell(child: child),
      routes: [
        // Tab routes - OK
        GoRoute(path: '/', builder: ...),
        GoRoute(path: '/events', builder: ...),

        // WRONG! This route is INSIDE ShellRoute but has DIFFERENT parentNavigatorKey
        GoRoute(
          path: '/events/:eventId',
          parentNavigatorKey: rootNavigatorKey,  // <-- CRASH! Doesn't match shellNavigatorKey
          builder: (context, state) {
            final eventId = state.pathParameters['eventId']!;
            return EventDetailScreen(eventId: eventId);
          },
        ),
      ],
    ),
  ],
);
```

---

## The Correct Pattern

**Simple Rule:**
- Tab screens go INSIDE ShellRoute (shows bottom nav)
- Full-screen/detail screens go OUTSIDE ShellRoute at root level (no bottom nav)
- Don't use `parentNavigatorKey` at all for full-screen routes

```dart
final rootNavigatorKey = GlobalKey<NavigatorState>();
final shellNavigatorKey = GlobalKey<NavigatorState>();

GoRouter(
  navigatorKey: rootNavigatorKey,
  routes: [
    // Auth routes (no bottom nav)
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),

    // Main shell with bottom navigation
    ShellRoute(
      navigatorKey: shellNavigatorKey,
      builder: (context, state, child) => MainShell(child: child),
      routes: [
        // ONLY tab screens go here
        GoRoute(path: '/', pageBuilder: (context, state) =>
          const NoTransitionPage(child: HomeScreen())),
        GoRoute(path: '/events', pageBuilder: (context, state) =>
          const NoTransitionPage(child: EventsScreen())),
        GoRoute(path: '/profile', pageBuilder: (context, state) =>
          const NoTransitionPage(child: ProfileScreen())),
      ],
    ),

    // Full-screen routes OUTSIDE ShellRoute (no parentNavigatorKey needed!)
    GoRoute(
      path: '/events/:eventId',
      name: 'eventDetail',
      builder: (context, state) {
        final eventId = state.pathParameters['eventId']!;
        return EventDetailScreen(eventId: eventId);
      },
    ),
    GoRoute(
      path: '/events/:eventId/chat',
      name: 'eventChat',
      builder: (context, state) {
        final eventId = state.pathParameters['eventId']!;
        return EventChatScreen(eventId: eventId);
      },
    ),
    GoRoute(
      path: '/events/create',
      name: 'createEvent',
      builder: (context, state) => const CreateEventScreen(),
    ),
    GoRoute(
      path: '/settings',
      name: 'settings',
      builder: (context, state) => const SettingsScreen(),
    ),
  ],
);
```

---

## Route Organization Strategy

### Inside ShellRoute (Shows Bottom Nav)
- Home tab (`/`)
- Events list tab (`/events`)
- Friends tab (`/friends`)
- Groups tab (`/groups`)
- Profile tab (`/profile`)

### Outside ShellRoute (Full Screen, No Bottom Nav)
- Auth screens (`/login`, `/onboarding`)
- Detail screens (`/events/:id`, `/groups/:id`)
- Create/edit screens (`/events/create`, `/profile/edit`)
- Chat screens (`/events/:id/chat`)
- Settings and sub-screens (`/settings`, `/settings/blocked-users`)

---

## Navigation Methods

```dart
// Navigate to tab (stays in shell, replaces current tab)
context.go('/events');

// Navigate to detail screen (pushes full-screen on top of shell)
context.push('/events/$eventId');

// Navigate from detail back to tabs
context.go('/events');  // Goes back to events tab

// Push detail from detail (stacks full-screen routes)
context.push('/events/$eventId/chat');
```

---

## Debugging Checklist

### When App Crashes on Launch
- [ ] Check for `parentNavigatorKey` inside ShellRoute routes
- [ ] Verify all sub-routes have either `parentNavigatorKey: null` OR match parent's key
- [ ] Move full-screen routes outside ShellRoute
- [ ] Remove `parentNavigatorKey` from routes outside ShellRoute (not needed)

### Verifying Route Structure
```bash
# Search for parentNavigatorKey usage
grep -n "parentNavigatorKey" lib/config/routes.dart

# Search for ShellRoute structure
grep -n "ShellRoute\|navigatorKey" lib/config/routes.dart
```

### Common File Location
- **Routes:** `lib/config/routes.dart`
- **Main Shell:** Usually in same file or `lib/widgets/main_shell.dart`

---

## Key Insight

The error says "sub-route's parent navigator key must either be null OR has the same navigator key as parent's key."

**Translation:**
- If route is INSIDE ShellRoute → don't set `parentNavigatorKey` (leave null)
- If route is OUTSIDE ShellRoute at root → don't need `parentNavigatorKey` at all
- Only use `parentNavigatorKey` for nested ShellRoutes (advanced pattern)

**2025 Best Practice:** Keep it simple - tabs in ShellRoute, everything else at root level.
