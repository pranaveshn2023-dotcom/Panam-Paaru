# ⚡ PAANAM PARU (Neo-Brutalist Money Management)

> **"See your money. Control your spending."**

PAANAM PARU is a high-speed personal money-management platform built around simplicity, speed, clarity, and precision. It features real-time synchronization via **Convex Cloud DB**, **Google OAuth 2.0** via `@convex-dev/auth`, a **6-Digit PIN Security Lock**, a **Calendar-Aware Recurring Budget Engine**, and a distinct **Neo-Brutalist** UI/UX for Desktop & Mobile PWA.

---

## 🚀 Key Features

- **100% Cloud-Only Persistence (Zero Local Storage)**: All transactions, recurring budgets, user profiles, and security parameters are persisted in Convex Cloud DB.All transactions, recurring budgets, user profiles, and security parameters are persisted in Convex Cloud DB.
- **Google OAuth 2.0 Authentication**: Seamless 1-click Google Sign-In with Convex Auth backend integration and email/password fallback.
- **6-Digit PIN Security Lock**:
  - Tactile Neo-Brutalist keypad with physical numpad keyboard support.
  - SHA-256 cloud-hashed verification with auto-lock inactivity timers (Immediate, 1 min, 5 min, 15 min).
  - Screen lock overlay on session resumption or window blur.
- **Signature Calendar-Aware Recurring Budget Engine**:
  - Deterministic engine for Daily, Weekly, Monthly, Quarterly, and Yearly budget cycles.
  - Month-end clamping (Jan 31 → Feb 28/29 → Mar 31) and leap-year safe calculations.
  - Real-time spend aggregation and over-budget warnings.
- **Neo-Brutalist Design System**:
  - 3px solid dark borders, hard 4px box-shadow offsets, vibrant color accents, tactile button depressions (`translate(2px, 2px)`).
  - Responsive layout: Desktop floating sidebar + Mobile sticky bottom navigation dock.

---

## 🛠️ Google OAuth Setup in Convex

To enable Google OAuth for your Paanam deployment:

### 1. Google Cloud Console Configuration
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials** and click **Create Credentials > OAuth client ID**.
3. Select **Web application** as the application type.
4. **Authorized JavaScript origins**: Add `http://localhost:5173` (and your production domain).
5. **Authorized redirect URIs**: Add your Convex HTTP Actions URL:
   ```
   https://<your-deployment-name>.convex.site/api/auth/callback/google
   ```

### 2. Set Environment Variables in Convex Dashboard
1. Open your [Convex Dashboard](https://dashboard.convex.dev/).
2. Navigate to **Settings > Environment Variables**.
3. Add:
   - `AUTH_GOOGLE_ID`: Your Google OAuth Client ID
   - `AUTH_GOOGLE_SECRET`: Your Google OAuth Client Secret

---

## 💻 Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Convex Backend
```bash
npx convex dev
```

### 3. Start Frontend Dev Server
```bash
npm run dev
```

Visit `http://localhost:5173` to explore Paanam Paru!
