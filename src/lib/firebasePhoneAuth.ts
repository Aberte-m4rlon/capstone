/**
 * Firebase Phone Authentication Helper
 * Real SMS OTP dispatch using Google Firebase (10,000 Free SMS / month)
 */

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from './firebase';

let confirmationResultCache: ConfirmationResult | null = null;
let recaptchaVerifierCache: RecaptchaVerifier | null = null;

/**
 * Initializes or resets the reCAPTCHA verifier widget
 */
export function getOrCreateRecaptchaVerifier(containerId: string = 'recaptcha-container'): RecaptchaVerifier | null {
  if (!firebaseAuth) return null;

  try {
    if (recaptchaVerifierCache) {
      return recaptchaVerifierCache;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('[Firebase Auth] reCAPTCHA container #' + containerId + ' not found.');
    }

    recaptchaVerifierCache = new RecaptchaVerifier(firebaseAuth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        if (recaptchaVerifierCache) {
          try {
            recaptchaVerifierCache.clear();
          } catch {}
          recaptchaVerifierCache = null;
        }
      },
    });

    return recaptchaVerifierCache;
  } catch (err) {
    console.error('[Firebase Auth] Failed to initialize RecaptchaVerifier:', err);
    return null;
  }
}

export interface FirebasePhoneSendResult {
  success: boolean;
  message: string;
  error?: string;
  confirmationResult?: ConfirmationResult;
}

/**
 * Send real 6-digit SMS OTP via Firebase Phone Auth
 */
export async function sendFirebasePhoneOtp(
  phoneNumberE164: string,
  containerId: string = 'recaptcha-container'
): Promise<FirebasePhoneSendResult> {
  if (!isFirebaseConfigured() || !firebaseAuth) {
    return {
      success: false,
      message: 'Firebase is not configured yet. Please provide your Firebase credentials.',
      error: 'FIREBASE_NOT_CONFIGURED',
    };
  }

  try {
    const verifier = getOrCreateRecaptchaVerifier(containerId);
    if (!verifier) {
      return {
        success: false,
        message: 'Could not initialize reCAPTCHA verifier for SMS.',
        error: 'RECAPTCHA_FAILED',
      };
    }

    const confirmationResult = await signInWithPhoneNumber(firebaseAuth, phoneNumberE164, verifier);
    confirmationResultCache = confirmationResult;

    return {
      success: true,
      message: 'SMS verification code sent to ' + phoneNumberE164 + ' via Firebase (Free Tier).',
      confirmationResult,
    };
  } catch (err: any) {
    console.error('[Firebase Phone Auth] Send error:', err);

    // Reset verifier on error so subsequent attempts can re-render
    if (recaptchaVerifierCache) {
      try {
        recaptchaVerifierCache.clear();
      } catch {}
      recaptchaVerifierCache = null;
    }

    let userFriendlyMessage = 'Failed to send SMS verification code.';
    if (err.code === 'auth/invalid-phone-number') {
      userFriendlyMessage = 'The phone number format is invalid. Please use +639XXXXXXXXX format.';
    } else if (err.code === 'auth/too-many-requests') {
      userFriendlyMessage = 'Too many requests. Please wait a few minutes before requesting another code.';
    } else if (err.code === 'auth/quota-exceeded') {
      userFriendlyMessage = 'SMS quota exceeded for today. Please try again later.';
    } else if (err.code === 'auth/captcha-check-failed') {
      userFriendlyMessage = 'reCAPTCHA verification failed. Please try again.';
    } else if (err.message) {
      userFriendlyMessage = err.message;
    }

    return {
      success: false,
      message: userFriendlyMessage,
      error: err.code || 'FIREBASE_ERROR',
    };
  }
}

export interface FirebasePhoneVerifyResult {
  success: boolean;
  message: string;
  error?: string;
  user?: any;
}

/**
 * Confirm 6-digit OTP code sent via Firebase Phone Auth
 */
export async function verifyFirebasePhoneOtp(code: string): Promise<FirebasePhoneVerifyResult> {
  if (!confirmationResultCache) {
    return {
      success: false,
      message: 'No pending SMS verification. Please request a new verification code.',
      error: 'NO_CONFIRMATION_RESULT',
    };
  }

  try {
    const userCredential = await confirmationResultCache.confirm(code.trim());
    return {
      success: true,
      message: 'Phone number verified successfully.',
      user: userCredential.user,
    };
  } catch (err: any) {
    console.error('[Firebase Phone Auth] Confirm error:', err);

    let userFriendlyMessage = 'Incorrect verification code.';
    if (err.code === 'auth/invalid-verification-code') {
      userFriendlyMessage = 'The verification code entered is incorrect. Please check your SMS messages.';
    } else if (err.code === 'auth/code-expired') {
      userFriendlyMessage = 'This verification code has expired. Please click "Resend SMS".';
    }

    return {
      success: false,
      message: userFriendlyMessage,
      error: err.code || 'INVALID_CODE',
    };
  }
}
