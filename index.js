const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_KEY);


// use all the middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qahuo.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// verify jesonwebtoken
function verifyJWT (req,res,next) {
    const authHeader = req.headers.authorization ;
    if(!authHeader) {
        return res.status(403).send({message: "UnAuthorized Access Access"})
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function(err,decoded) {
        if(err) {
            return res.status(401).send({message: "Forbidden Access"})
        }
        req.decoded = decoded
        next();
    })

}


async function run() {
  try {
    const appointmentOptionCollection = client.db("revision_content_serverside").collection("AppointmentOptions");
    const bookingsCollection = client.db("revision_content_serverside").collection("Bookings");
    const usersCollection = client.db("revision_content_serverside").collection("Users");
    const doctorsCollection = client.db("revision_content_serverside").collection("Doctors");
    const paymentsCollection = client.db("revision_content_serverside").collection("Payments");


    // verify Admin Middleware It Will Works After verifyJWT
    const verifyAdmin = async(req,res,next) => {
        const decodedEmail = req.decoded.email;
        const query = {email:decodedEmail};
        const user = await usersCollection.findOne(query);
        if(user?.role !== "admin") {
            return res.status(403).send({message : "Forbidden Access"})
        }
        next();

    }

    // get all the data from the database availableAppointment.js
    app.get("/appointmentOptions", async(req,res) => {
        const date = req.query.date;
        const query = {};
        const options = await appointmentOptionCollection.find(query).toArray();
        const bookingQuery = {appointmentDate: date};
        const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
        options.forEach((option) => {
            const optiondBooked = alreadyBooked.filter((book) => book.treatmentName === option.name);
            const bookedSlots = optiondBooked.map(book => book.slot);
            const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
            // console.log(remainingSlots)
            option.slots = remainingSlots

        })
        res.send(options);
    });
    
    // BookingModal.js under work
    app.post("/bookings", async(req,res) => {
        const booking = req.body;
        const query = {
            appointmentDate : booking.appointmentDate,
            treatmentName : booking.treatmentName,
            email : booking.email
        }
        const alreadyBooked = await bookingsCollection.find(query).toArray();
        if(alreadyBooked.length) {
            const message = `You Already Have An Appointment On ${booking.appointmentDate}`
            return res.send({acknowledged: false, message})
        }
        const result = await bookingsCollection.insertOne(booking);
        res.send(result);
    });

    // MyAppointment.js
    app.get("/bookings",verifyJWT,async(req,res) => {
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if(email !== decodedEmail) {
            return res.status(403).send({message: "Forbidden Access"})
        }
        // console.log(decodedEmail);
        const query = {email:email};
        const bookings = await bookingsCollection.find(query).toArray();
        res.send(bookings);
    })

    // SignUp.js
    app.post("/users", async(req,res) => {
        const user = req.body ;
        const result = await usersCollection.insertOne(user);
        res.send(result);
    });

    // Continue With Google Button Login.js and SignUp.js
    app.put("/users/:email", async(req,res) => {
        const email = req.params.email;
        const updateUser = req.body;
        const filter = {email:email,};
        const options = { upsert: true };
        const updateDoc = {
            $set: {
                email : updateUser.email,
                name: updateUser.name,
            },
          };

          const result = await usersCollection.updateOne(filter,updateDoc,options);
        //   console.log(result);
          res.send(result);
    });

    

    // create a jsonwebtoken
    app.get("/jwt", async(req,res) => {
        const email = req.query.email;
        const query = {email:email};
        const user = await usersCollection.findOne(query);
        if(user) {
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN)
            return res.send({accessToken:token})
        }
        res.status(403).send({accessToken : "Forbidden Access"})
    });

    // get all the users on the AllUsers.js
    app.get("/users", async(req,res) => {
        const query = {};
        const cursor = await usersCollection.find(query).toArray();
        res.send(cursor)
    })

    // make admin api on AllUsers.js
    app.put("/users/admin/:id", verifyJWT , async(req,res) => {
        const decodedEmail = req.decoded.email;
        const query = {email:decodedEmail};
        const user = await usersCollection.findOne(query);
        if(user?.role !== "admin") {
            return res.status(403).send({message: "Forbidden Access"})
        }
        const id = req.params.id;
        const filter = {_id : new ObjectId(id)};
        const options = {upsert:true};
        const updateDoc = {
            $set : {
                role: "admin",
            }
        }
        const result = await usersCollection.updateOne(filter,updateDoc,options);
        // console.log(result);
        res.send(result);
    });

    // delete admin api on AllUsers.js
    app.delete("/users/admin/:id", verifyJWT, async(req,res) => {
        const decodedEmail = req.decoded.email;
        const decodedQuery = {email:decodedEmail};
        const docededUser = await usersCollection.findOne(decodedQuery);
        if(docededUser?.role !== "admin") {
            return res.status(403).send({message: "Forbidden Access"})
        }
        const id = req.params.id;
        const query = {_id : new ObjectId(id)};
        const result = await usersCollection.deleteOne(query);
        // console.log(result)
        res.send(result)
    })

    // check admin And Protect The Router api useAdmin.js
    app.get("/users/admin/:email", async(req,res) => {
        const email = req.params.email;
        const query = {email:email};
        const user = await usersCollection.findOne(query);
        res.send({isAdmin: user?.role === "admin"})
    });


    // AddDoctor.js
    app.get("/appointmentSpecialty", async(req,res) => {
        const query = {};
        const result = await appointmentOptionCollection.find(query).project({name:1}).toArray();
        res.send(result);
    })

    // Add A Doctor In The Database AddDoctor.js
    app.post("/doctors",verifyJWT,verifyAdmin, async(req,res) => {
        const doctor = req.body;
        const result = await doctorsCollection.insertOne(doctor);
        // console.log(result);
        res.send(result);
    });

    // get all the doctors ManageDoctors.js
    app.get("/doctors",verifyJWT,verifyAdmin, async(req,res) => {
        const query = {};
        const result = await doctorsCollection.find(query).toArray();
        res.send(result);
    });

    // delete a doctor ManageDoctors.js
    app.delete("/doctors/:id",verifyJWT,verifyAdmin, async(req,res) => {
        const id = req.params.id;
        const query = {_id : new ObjectId(id)};
        const result = await doctorsCollection.deleteOne(query);
        res.send(result);
    });

    // get a single booking Routes.js inside Loader Function
    app.get("/bookings/:id", async(req,res) => {
        const id = req.params.id;
        const query = {_id : new ObjectId (id)};
        const booking = await bookingsCollection.findOne(query);
        res.send(booking);
    });


    // Stripe intregration Code CheckoutForm.js
    app.post("/create-payment-intent", async(req,res) => {
        const booking = req.body;
        const price = booking.price;
        const amount = price*100 ;

        const paymentIntent = await stripe.paymentIntents.create({
            currency: "usd",
            amount: amount,
            "payment_method_types": [
                "card"
              ],
        });

       res.send({clientSecret: paymentIntent.client_secret,});
    });

    
    // CheckoutForm.js
    app.post("/payments", async(req,res) => {
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        const id = payment.bookingId ;
        const filter = {_id : new ObjectId(id)} ;
        const updatedDoc = {
            $set : {
                paid : true,
                transactionId : payment.transactionId
            }
        };
        const updatedResult = await bookingsCollection.updateOne(filter,updatedDoc)
        res.send(result)
    })





  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Hello Practice Server Again And Again");
});

app.listen(port, () => {
  console.log(`Listening To The Port ${port} Successfully`);
});
