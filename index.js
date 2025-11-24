const express = require("express");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
const cors = require("cors");
const app = express();
const crypto = require("crypto");

// Tracing ID generate function
function generateTracingId() {
  return crypto.randomBytes(16).toString("hex"); // 16 bytes secure random ID
}
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const IsAuthorized = (req, res, next) => {
  // console.log(req.headers.authorization)
  const isAuthorized = req.headers.authorization?.split(" ")[1];
  if (!isAuthorized) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  next();
};
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("ZapShift");
    const parcellCollections = db.collection("parlcels");
    const paidParcelCollections = db.collection("paidParcelcollection");
    // AllGet Sections
    app.get("/parcels", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.SenderEamil = email;
      }
      const cursor = parcellCollections.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    // indivituil get sections
    app.get("/parcels/:parcelId", async (req, res) => {
      const id = req.params.parcelId;
      const result = await parcellCollections.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // All Post Sections
    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date();
      const result = await parcellCollections.insertOne(parcel);
      res.send(result);
    });

    // Delete Sections
    // Parcel Delete
    app.delete("/parcels/:parcelId", async (req, res) => {
      const id = req.params.parcelId;
      const result = await parcellCollections.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // paymentApi
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const price = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "USD",
              unit_amount: price,
              product_data: {
                name: paymentInfo.percelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.email,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.id,
          parcelName: paymentInfo.percelName,
        },
        success_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.STRIPE_DOMAIN}/dashboard/payment-cancel`,
      });

      // res.redirect(303, session.url);
      res.send({ url: session.url });
    });

    // paymet Update
    app.patch("/payment-status", async (req, res) => {
      const paidParcelId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(paidParcelId);
      const transitionId = session.payment_intent;
      const query = { transitionId };
      const paymentIsExist = await paidParcelCollections.findOne(query);
      console.log(paymentIsExist);
      if (paymentIsExist) {
        return res.send({
          TracingId: paymentIsExist.TracingId,
          TransactionId: session.payment_intent,
        });
      }
      const tracingId = generateTracingId();
      if (session.payment_status === "paid") {
        const update = {
          $set: { paymentStatus: "paid", TracingId: tracingId },
        };
        const paidParcel = await parcellCollections.updateOne(
          { _id: new ObjectId(session.metadata.parcelId) },
          update
        );
        // console.log(session)
        const paidParcelInfo = {
          paidparcelId: session.metadata.parcelId,
          paidParcelName: session.metadata.parcelName,
          transitionId: session.payment_intent,
          paidByEmail: session.customer_details.email,
          paidByName: session.customer_details.name,
          amount: session.amount_total / 100,
          TracingId: tracingId,
          paidAt: new Date(),
        };
        if (session.payment_status === "paid") {
          const result = await paidParcelCollections.insertOne(paidParcelInfo);
        }
        res.send({
          success: true,
          updatedParcel: paidParcel,
          // paidParcel: result,
          TracingId: tracingId,
          TransactionId: session.payment_intent,
        });
      }
    });

    // Get Single Payment infos
    app.get("/paidsinfo", IsAuthorized, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.paidByEmail = email;
      }
      const cursor = paidParcelCollections.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
// Simple commnet for test
// {
//   id: 'cs_test_a1dE2mS7lj7yx65t1wMD1WNIYjSmWz00DP83v9KHSXHOOzmUWRqj44BiG4',
//   object: 'checkout.session',
//   adaptive_pricing: { enabled: true },
//   after_expiration: null,
//   allow_promotion_codes: null,
//   amount_subtotal: 27000,
//   amount_total: 27000,
//   automatic_tax: { enabled: false, liability: null, provider: null, status: null },
//   billing_address_collection: null,
//   branding_settings: {
//     background_color: '#ffffff',
//     border_style: 'rounded',
//     button_color: '#0074d4',
//     display_name: '',
//     font_family: 'default',
//     icon: null,
//     logo: null
//   },
//   cancel_url: 'http://localhost:5173/dashboard/payment-cancel',
//   client_reference_id: null,
//   client_secret: null,
//   collected_information: {
//     business_name: null,
//     individual_name: null,
//     shipping_details: null
//   },
//   consent: null,
//   consent_collection: null,
//   created: 1763903030,
//   currency: 'usd',
//   currency_conversion: null,
//   custom_fields: [],
//   custom_text: {
//     after_submit: null,
//     shipping_address: null,
//     submit: null,
//     terms_of_service_acceptance: null
//   },
//   customer: null,
//   customer_creation: 'if_required',
//   customer_details: {
//     address: {
//       city: null,
//       country: 'BD',
//       line1: null,
//       line2: null,
//       postal_code: null,
//       state: null
//     },
//     business_name: null,
//     email: 'arifulq234@gmail.com',
//     individual_name: null,
//     name: 'Ariful',
//     phone: null,
//     tax_exempt: 'none',
//     tax_ids: []
//   },
//   customer_email: 'arifulq234@gmail.com',
//   discounts: [],
//   expires_at: 1763989430,
//   invoice: null,
//   invoice_creation: {
//     enabled: false,
//     invoice_data: {
//       account_tax_ids: null,
//       custom_fields: null,
//       description: null,
//       footer: null,
//       issuer: null,
//       metadata: {},
//       rendering_options: null
//     }
//   },
//   livemode: false,
//   locale: null,
//   metadata: { parcelId: '691f8e7d66fc9df0872b9c32' },
//   mode: 'payment',
//   origin_context: null,
//   payment_intent: 'pi_3SWcxmD5dRVW8WOz0RaxfAUX',
//   payment_link: null,
//   payment_method_collection: 'if_required',
//   payment_method_configuration_details: { id: 'pmc_1SVeHPD5dRVW8WOzWWWVH47n', parent: null },
//   payment_method_options: { card: { request_three_d_secure: 'automatic' } },
//   payment_method_types: [ 'card', 'link' ],
//   payment_status: 'paid',
//   permissions: null,
//   phone_number_collection: { enabled: false },
//   presentment_details: { presentment_amount: 3428058, presentment_currency: 'bdt' },
//   recovered_from: null,
//   saved_payment_method_options: null,
//   setup_intent: null,
//   shipping_address_collection: null,
//   shipping_cost: null,
//   shipping_options: [],
//   status: 'complete',
//   submit_type: null,
//   subscription: null,
//   success_url: 'http://localhost:5173/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}',
//   total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
//   ui_mode: 'hosted',
//   url: null,
//   wallet_options: null
// }
