---
description: How to setup Firebase App Check with reCAPTCHA v3
---

# Setting up Firebase App Check (Web)

To resolve the "ReCAPTCHA error" and secure your app, you need to generate reCAPTCHA v3 keys and configure them in both the Firebase Console and your local environment.

## 1. Generate reCAPTCHA v3 Keys
1.  Go to the [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create).
2.  **Label**: Enter a name (e.g., "SFU Ride Share").
3.  **reCAPTCHA type**: Select **Score based (v3)**.
4.  **Domains**: Add the following domains:
    *   `localhost`
    *   `127.0.0.1`
    *   Your Firebase Hosting domain (e.g., `ride-share-50bcd.web.app` or `ride-share-50bcd.firebaseapp.com` - check your `.env.local` `FIREBASE_AUTH_DOMAIN`).
5.  **Owners**: Your email should be there.
6.  Accept the Terms of Service and click **Submit**.
7.  **Keep this page open**. You will see a **Site Key** and a **Secret Key**.

## 2. Configure Firebase Console
1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project (**ride-share-50bcd**).
3.  In the left sidebar, go to **Build** -> **App Check**.
4.  Click **Get Started** if you haven't already.
5.  In the **Apps** tab, find your **Web App** and click it to expand details.
6.  Click **Register** (or the edit icon) for **reCAPTCHA v3**.
7.  Paste the **Secret Key** from step 1 into the "reCAPTCHA secret key" field.
8.  Click **Save**.

## 3. Configure Local Environment
1.  Open your `.env.local` file.
2.  Find the `FIREBASE_APPCHECK_SITE_KEY` variable.
3.  Paste the **Site Key** (NOT the secret key) from step 1.
    ```bash
    FIREBASE_APPCHECK_SITE_KEY=your-copied-site-key
    ```
4.  Save the file.
5.  **Restart your development server** (`npm run web`) to load the new environment variable.

> [!NOTE]
> It may take a few minutes for the keys to propagate. If you still see errors, verify that `localhost` is in your reCAPTCHA domains list.
