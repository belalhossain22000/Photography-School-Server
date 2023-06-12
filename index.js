const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(`${process.env.PAYMENT_SECRECT_KEY}`);
const jwt = require("jsonwebtoken");
// Enable  middleware
app.use(cors());
app.use(express.json());

//verify jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  // console.log(token);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;

    next();
  });
};

// console.log(process.env.DB_USERNAME, process.env.DB_PASSWORD);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.dp3om9f.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    //------*************-------//

    const usersCollection = client.db("photoSchoolDb").collection("users");
    const classesCollection = client.db("photoSchoolDb").collection("classes");
    const SelectedClassesCollection = client
      .db("photoSchoolDb")
      .collection("selectedClasses");

    //jwt
    app.post("/jwt", (req, res) => {
      const email = req.body;
      // console.log(email);
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET_KEY, {
        expiresIn: "1h",
      });
      // console.log(token);
      res.send({ token });
    });

    //payment

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log(price);
      if (price) {
        const amount = parseFloat(price) * 100;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          automatic_payment_methods: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    //user get api

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    //get user by email

    app.get("/users/:email", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(user);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });


    //user post api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      // console.log(user);
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      // console.log(existingUser);

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    
    //change role api

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //get instructor user
    app.get("/instructor", async (req, res) => {
      const result = await usersCollection
        .find({ role: "Instructor" })
        .toArray();
      res.send(result);
    });

    //classes get api

    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    //get classes by id
    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const result = await classesCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    //get classes by email
    app.get("/classess/:email", async (req, res) => {
      const email = req.params.email;
      const result = await classesCollection
        .find({ instructorEmail: email })
        .toArray();
      res.send(result);
    });

    //classes post api
    app.post("/classes", async (req, res) => {
      const item = req.body;
      const result = await classesCollection.insertOne(item);
      res.send(result);
    });

    //update by instructor
    app.patch("/classes/:id", async (req, res) => {
      const itemId = req.params.id;
      const updatedFields = req.body;
      console.log(itemId, updatedFields);

      try {
        const result = await classesCollection.findOneAndUpdate(
          { _id: new ObjectId(itemId) },
          { $set: updatedFields },
          { returnOriginal: false }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating item:", error);
        res.status(500).send("Error updating item");
      }
    });

    // //update status classes api

    app.patch("/classes/:id", async (req, res) => {
      try {
        const classId = req.params.id;
        const { status, feedback } = req.body;

        if (status) {
          // Update status
          const result = await classesCollection.updateOne(
            { _id: new ObjectId(classId) },
            { $set: { status: status } }
          );

          res.send(result);
        } else if (feedback) {
          const result = await classesCollection.updateOne(
            { _id: new ObjectId(classId) },
            { $set: { feedback: feedback } }
          );

          res.send(result);
        } else {
          res.status(400).json({ error: "Invalid request" });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //make payment api

    app.patch("/makePayment/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);

      try {
        const result = await classesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          console.log("Class not found.");
          res.status(404).send("Class not found.");
          return;
        }

        const newStudent = parseInt(result.students) + 1;
        const newSeats = parseInt(result.availableSeats) - 1;

        const updateDoc = {
          $set: {
            students: newStudent,
            availableSeats: newSeats,
          },
        };

        // Update the document
        const updateResult = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (updateResult.modifiedCount === 1) {
          console.log("Class updated successfully.");
          res.send("Payment successful");
        } else {
          console.log("Failed to update class.");
          res.status(500).send("Failed to update class.");
        }
      } catch (error) {
        console.log("Error updating class:", error);
        res.status(500).send("Error updating class");
      }
    });

    // app.patch("/classes/:id", async (req, res) => {
    //   try {
    //     const classId = req.params.id;
    //     const { increment } = req.body;

    //     if (typeof increment !== "number") {
    //       return res.status(400).json({ error: "Invalid increment value" });
    //     }

    //     // Update the class by ID and increment the "students" field
    //     const updatedClass = await classesCollection.findOneAndUpdate(
    //       { _id: new ObjectId(classId) },
    //       { $inc: { students: increment } },
    //       { returnOriginal: false }
    //     );

    //     res.json(updatedClass);
    //   } catch (error) {
    //     console.error("Error updating students field:", error);
    //     res.status(500).json({ error: "Internal server error" });
    //   }
    // });

    //selected classes post api

    app.post("/postSelectedClasses", async (req, res) => {
      const selectedClasses = req.body;

      try {
        const result = await SelectedClassesCollection.insertOne({
          selectedClasses,
        });
        res.send(result);
      } catch (error) {
        console.error("Error posting selected classes:", error);
        res.status(500).json({ error: "Failed to post selected classes" });
      }
    });

    //get selected classes
    app.get("/selectedClasses/:email",verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        // console.log(email);
        const result = await SelectedClassesCollection.find({
          "selectedClasses.email": email,
        }).toArray();

        // Send the retrieved data as a response
        res.send(result);
      } catch (error) {
        // Handle any errors that occur during the process
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // DELETE /selectedClasses/:email/:id
    app.delete("/selectedClasses/:email/:id", async (req, res) => {
      try {
        const { email, id } = req.params;
        // console.log

        // Perform the deletion in the MongoDB database
        const result = await SelectedClassesCollection.deleteOne({
          "selectedClasses.email": email,
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
