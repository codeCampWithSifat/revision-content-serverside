const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");

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
        console.log(decodedEmail);
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

    // google Login.js and SignUp.js
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

    // get all the users on the AllUsers.js
    app.get("/users", async(req,res) => {
        const query = {};
        const cursor = await usersCollection.find(query).toArray();
        res.send(cursor)
    })

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
