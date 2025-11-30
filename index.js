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
const admin = require("firebase-admin");

const serviceAccount = require("./zapshift--firebase-adminsdk.json");
const { Auth } = require("firebase-admin/auth");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const IsAuthorized = async(req, res, next) => {
  // console.log(req.headers.authorization)
  const isAuthorized = req.headers.authorization?.split(" ")[1];
  if (!isAuthorized) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  const decode=await admin.auth().verifyIdToken(isAuthorized)
  // console.log(decode)
  req.decodedEmail=decode.email
  if(admin)
  next();
};
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("ZapShift");
    const parcellCollections = db.collection("parlcels");
    const userCollections = db.collection("userCollections");
   const paidParcelCollections = db.collection("paidParcelcollection");
   const riderCollections=db.collection("riderCollections")
  //  MidleWare with Database
   const verifyAdmin=async(req,res,next)=>{
    const email=req.decodedEmail
    const user=await userCollections.findOne({email})
    if(user.role!=='admin'){
      return res.status(403).send("message:Admin can only access this")
    }
    next()
   }

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
        if(req.decodedEmail!==email){
          return res.status(403).send({message:"Forbidden"})
        }
      }
      const cursor = paidParcelCollections.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
app.post('/users',async(req,res)=>{
  const user=req.body;
  const query={email:user.email}
  const isExist=await userCollections.findOne(query)
  if(isExist){
    return res.status(401).send({message:"userAlreadyExist"})
  }
  user.createAt=new Date()
  user.role="user"
  const result=await userCollections.insertOne(user)
  res.send(result)
})
app.get('/users',IsAuthorized,verifyAdmin,async(req,res)=>{
  const cursor=userCollections.find()
  const result=await cursor.toArray()
  res.send(result)
})
app.patch('/users/:id',async(req,res)=>{
  const id=req.params.id;
  const UserInfo=req.body
  const result=await userCollections.updateOne({_id:new ObjectId(id)},{$set:{role:UserInfo.role}})
  res.send(result)
})
// app.get('/users/:id',async(req,res)=>{

// })
app.get('/users/:email/role',IsAuthorized,async(req,res)=>{
  const query={email:req.params.email}
  const result=await userCollections.findOne(query)
  res.send({role:result.role})

})
// Rider Related Api
app.post("/riders",async(req,res)=>{
  const riderInfo=req.body;
  riderInfo.applyAt=new Date()
  riderInfo.status='pending'
  const result=await riderCollections.insertOne(riderInfo)
  res.send(result)
})
app.get('/riders',IsAuthorized,verifyAdmin,async(req,res)=>{
  const cursor=riderCollections.find()
  const resutlt=await cursor.toArray()
  res.send(resutlt)
})
app.patch('/riders/:id',async(req,res)=>{
  const id=req.params.id
  const updateInfo={
    $set:{status:req.body.status}
  }
  const result=await riderCollections.updateOne({_id:new ObjectId(id)},updateInfo)
  res.send(result)
  if(req.body.status==="approved"){
      const userUpdate=await userCollections.updateOne({email:req.body.email},{$set:{role:"Rider"}})

  }
  if(req.body.status==="rejected"){
      const userUpdate=await userCollections.updateOne({email:req.body.email},{$set:{role:"user"}})

  }
})
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
