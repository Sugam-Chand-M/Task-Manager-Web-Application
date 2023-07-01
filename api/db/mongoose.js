// This will handle connection logic to the MongoDB database
//import { connect } from "mongoose";
const mongoose=require('mongoose');
const dotenv=require('dotenv');
dotenv.config();
mongoose.Promise=global.Promise;

mongoose.connect('mongodb://127.0.0.1:27017/TaskManager',{useNewUrlParser:true}).then(()=>{
    console.log("Connected to MongoDB successfully");
}).catch((e)=>{
    console.log("Error while connecting to MongoDb");
    console.log(e);
});

// to prevent deprication warnings
//mongoose.set('useCreateIndex',true);
//mongoose.set('useFindAndModify',false);

module.exports={
    mongoose
};
