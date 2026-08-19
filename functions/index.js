// M-Pesa Daraja integration for YobraPulse Premium.
//
// Two entry points:
//  - initiateStkPush (callable): a signed-in user asks to pay; we start an
//    STK push (Lipa Na M-Pesa Online) and record a pending payment.
//  - mpesaCallback (HTTP, public): Safaricom calls this when the customer
//    completes (or cancels) the prompt on their phone. This is the ONLY
//    place that ever marks a payment successful or activates a
//    subscription - the client never can, see firestore.rules.
//
// Secrets (consumer key/secret, passkey, shortcode) are never read from
// client code or committed to the repo - see functions/.env.example for
// what to set via `firebase functions:secrets:set`.

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const CONSUMER_KEY = defineSecret("DARAJA_CONSUMER_KEY");
const CONSUMER_SECRET = defineSecret("DARAJA_CONSUMER_SECRET");
const PASSKEY = defineSecret("DARAJA_PASSKEY");
const SHORTCODE = defineSecret("DARAJA_SHORTCODE");

// Non-secret, still per-environment: sandbox during development, switch to
// https://api.safaricom.co.ke once Safaricom approves production Go-Live.
const DARAJA_BASE_URL = defineString("DARAJA_BASE_URL", { default: "https://sandbox.safaricom.co.ke" });
// Only knowable after the first deploy (it's this function's own URL) -
// set it with `firebase functions:config` or a functions/.env file, see
// functions/.env.example.
const MPESA_CALLBACK_URL = defineString("MPESA_CALLBACK_URL", { default: "" });

// Fixed here, deliberately never trusted from the client - a client could
// otherwise request "weekly" pricing while claiming a "monthly" plan name.
const PLANS = {
  weekly: { amountKes: 30, days: 7, label: "Weekly Premium" },
  monthly: { amountKes: 100, days: 30, label: "Monthly Premium" },
};

function normalizePhone(raw) {
  // Daraja wants 2547XXXXXXXX / 2541XXXXXXXX - no plus, no leading 0.
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;
  return null;
}

function darajaTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Secrets set via `... | firebase functions:secrets:set` (piping a string
// through PowerShell into the CLI's stdin) can pick up a trailing newline
// from the pipeline - trim defensively so a stray \n never corrupts the
// Base64 Basic-Auth header or the STK push password.
function secretValue(param) {
  return param.value().trim();
}

async function getAccessToken() {
  const credentials = Buffer.from(`${secretValue(CONSUMER_KEY)}:${secretValue(CONSUMER_SECRET)}`).toString("base64");
  const res = await fetch(`${DARAJA_BASE_URL.value()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

exports.initiateStkPush = onCall(
  { secrets: [CONSUMER_KEY, CONSUMER_SECRET, PASSKEY, SHORTCODE] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const phone = normalizePhone(request.data && request.data.phoneNumber);
    if (!phone) {
      throw new HttpsError("invalid-argument", "Enter a valid Safaricom number, e.g. 07XXXXXXXX.");
    }
    const planId = request.data && request.data.plan;
    const plan = PLANS[planId];
    if (!plan) {
      throw new HttpsError("invalid-argument", "Choose a valid plan (weekly or monthly).");
    }
    const callbackUrl = MPESA_CALLBACK_URL.value();
    if (!callbackUrl) {
      throw new HttpsError("failed-precondition", "MPESA_CALLBACK_URL isn't configured yet - see functions/.env.example.");
    }

    const shortcode = secretValue(SHORTCODE);
    const timestamp = darajaTimestamp();
    const password = Buffer.from(`${shortcode}${secretValue(PASSKEY)}${timestamp}`).toString("base64");

    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (err) {
      console.error("Daraja OAuth error:", err);
      throw new HttpsError("internal", "Could not reach M-Pesa - please try again shortly.");
    }

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: plan.amountKes,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: "YobraPulse Premium",
      TransactionDesc: `YobraPulse ${plan.label}`,
    };

    const res = await fetch(`${DARAJA_BASE_URL.value()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (result.ResponseCode !== "0") {
      console.error("STK push rejected:", result);
      throw new HttpsError("internal", result.errorMessage || result.ResponseDescription || "M-Pesa declined the request.");
    }

    await db.collection("payments").doc(result.CheckoutRequestID).set({
      uid: request.auth.uid,
      phone,
      plan: planId,
      amount: plan.amountKes,
      status: "pending",
      merchantRequestId: result.MerchantRequestID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { checkoutRequestId: result.CheckoutRequestID, customerMessage: result.CustomerMessage };
  },
);

exports.mpesaCallback = onRequest(async (req, res) => {
  // Safaricom expects a 200 with this exact shape no matter what happens
  // on our end - anything else triggers retry storms from their side.
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    // Safaricom's callback doesn't reliably send a Content-Type Express's
    // JSON body parser recognizes, so req.body can land empty even though
    // real data was sent - fall back to the raw bytes Cloud Functions
    // always captures regardless of Content-Type.
    let parsedBody = req.body;
    if (!parsedBody || !parsedBody.Body) {
      try {
        parsedBody = JSON.parse(req.rawBody.toString("utf8"));
      } catch (parseErr) {
        console.error("mpesaCallback: could not parse rawBody as JSON:", req.rawBody && req.rawBody.toString("utf8"));
        ack();
        return;
      }
    }

    const stkCallback = parsedBody && parsedBody.Body && parsedBody.Body.stkCallback;
    if (!stkCallback) {
      console.warn("mpesaCallback: no Body.stkCallback in request - ignoring", JSON.stringify(parsedBody));
      ack();
      return;
    }
    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
    console.log(`mpesaCallback: CheckoutRequestID=${CheckoutRequestID} ResultCode=${ResultCode} ResultDesc=${ResultDesc}`);
    const paymentRef = db.collection("payments").doc(CheckoutRequestID);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      console.warn(`mpesaCallback: no payments doc found for CheckoutRequestID=${CheckoutRequestID} - ignoring`);
      ack();
      return;
    }

    if (ResultCode === 0) {
      const items = (CallbackMetadata && CallbackMetadata.Item) || [];
      const value = (name) => {
        const item = items.find((i) => i.Name === name);
        return item ? item.Value : undefined;
      };

      await paymentRef.update({
        status: "success",
        mpesaReceiptNumber: value("MpesaReceiptNumber") || null,
        amount: value("Amount") || paymentSnap.data().amount,
        resultDesc: ResultDesc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const { uid } = paymentSnap.data();
      const planId = paymentSnap.data().plan;
      const plan = PLANS[planId] || PLANS.monthly;
      const subRef = db.collection("subscriptions").doc(uid);
      const subSnap = await subRef.get();
      const currentExpiry = subSnap.exists() && subSnap.data().expiresAt ? subSnap.data().expiresAt.toMillis() : 0;
      // Renewing before the current period ends extends it, rather than
      // discarding whatever time was already paid for.
      const baseMillis = Math.max(Date.now(), currentExpiry);
      const expiresAt = admin.firestore.Timestamp.fromMillis(baseMillis + plan.days * 24 * 60 * 60 * 1000);
      await subRef.set({
        active: true,
        plan: planId,
        expiresAt,
        lastPaymentId: CheckoutRequestID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`mpesaCallback: subscription activated for uid=${uid}, plan=${planId}, expires=${expiresAt.toDate().toISOString()}`);
    } else {
      console.warn(`mpesaCallback: payment failed/cancelled - ${ResultDesc}`);
      await paymentRef.update({
        status: "failed",
        resultDesc: ResultDesc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    ack();
  } catch (err) {
    console.error("mpesaCallback error:", err);
    ack();
  }
});
