const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

// use all the middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qahuo.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});


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
    app.get("/bookings",async(req,res) => {
        const email = req.query.email;
        const query = {email:email};
        const bookings = await bookingsCollection.find(query).toArray();
        res.send(bookings);
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
