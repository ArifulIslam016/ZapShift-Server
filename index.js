const express = require("express");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
const cors = require("cors");
const app = express();
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("ZapShift");
    const parcellCollections = db.collection("parlcels");
    const paidParcelCollections=db.collection("paidParcelcollection")
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

      if (session.payment_status === "paid") {
        const update = {
          $set: { paymentStatus: "paid" },
        };
        const paidParcel =await parcellCollections.updateOne(
          { _id: new ObjectId(session.metadata.parcelId) },
          update
        );
        console.log(session)
        // const paidParcelInfo={
        //   parcelId:
        // }
      }
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