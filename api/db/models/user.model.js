const mongoose=require('mongoose');
const _=require('lodash');
const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const { resolve } = require('path');

// Jwt secret string
const jwtSecret="IU2c2HAef3z2KBOZOKoeQUOq6foUqyafTqFlQr7k";

const UserSchema=new mongoose.Schema({
    email:{
        type:String,
        required:true,
        minlength:1,
        trim:true,
        unique:true
    },
    password:{
        type:String,
        required:true,
        minlength:8,
    },
    sessions:[{
        token:{
            type:String,
            required:true
        },
        expiresAt:{
            type:String,
            required:true
        }
    }]
});

// Instance methods
UserSchema.methods.toJson=function(){
    const user=this;
    const userObject=user.toObject();
    // return the document except the password and sessions
    return _.omit(userObject,['password','sessions']);
}

UserSchema.methods.generateAccessAuthToken=function(){
    const user=this;
    return new Promise((resolve,reject)=>{
        // create JSON web token and return that
        jwt.sign({_id:user._id.toHexString()},jwtSecret,{expiresIn:"15m"},(err,token)=>{
            if(!err){
                resolve(token);
            }
            else{
                reject();
            }
        });
    });
}

UserSchema.methods.generateRefreshAuthToken=function(){
    // generates a 64 byte hex string
    return new Promise((resolve,reject)=>{
        crypto.randomBytes(64,(err,buf)=>{
            if(!err){
                let token=buf.toString('hex');
                return resolve(token);
            }
        });
    });
}

UserSchema.methods.createSession=function(){
    let user=this;
    return user.generateRefreshAuthToken().then((refreshToken)=>{
        return saveSessionToDatabase(user,refreshToken);
    }).then((refreshToken)=>{
        // saved to database successfully and now return the refresh token
        return refreshToken;
    }).catch((e)=>{
        return Promise.reject('Failed to save session to database.\n'+e);
    });
}

// Model methods (static methods)
UserSchema.statics.getJWTSecret=()=>{
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken=function(_id,token){
    // find user id and token, used in auth middleware
    const User=this;
    return User.findOne({
        _id,
        'sessions.token':token
    });
}

UserSchema.statics.findByCredentials=function(email,password){
    let User=this;
    return User.findOne({email}).then((user)=>{
        if(!user)
            return Promise.reject();
        return new Promise((resolve,reject)=>{
            bcrypt.compare(password,user.password,(err,res)=>{
                if(res)
                    resolve(user);
                else{
                    reject();
                }
            });
        });
    });
}

UserSchema.statics.hasRefreshTokenExpired=(expiresAt)=>{
    let secondsSinceEpoch=Date.now()/1000;
    if(expiresAt>secondsSinceEpoch){
        // hasn't expired
        return false;
    }
    else{
        // has expired
        return true;
    }
}

// Middleware
// before a user document is saved, this code runs
UserSchema.pre('save',function(next){
    let user=this;
    let costFactor=10;
    if(user.isModified('password')){
        // runs if the password is modified/changed
        // generate salt and hash password
        bcrypt.genSalt(costFactor,(err,salt)=>{
            bcrypt.hash(user.password,salt,(err,hash)=>{
                user.password=hash;
                next();
            });
        });
    }
    else{
        next();
    }
});

// Helper methods
let saveSessionToDatabase=(user,refreshToken)=>{
    // save session to database
    return new Promise((resolve,reject)=>{
        let expiresAt=generateRefreshTokenExpiryTime();
        user.sessions.push({'token':refreshToken,expiresAt});
        user.save().then(()=>{
            // saved session successfully
            return resolve(refreshToken);
        }).catch((e)=>{
            reject(e);
        });
    });
}

let generateRefreshTokenExpiryTime=()=>{
    let daysUntilExpire="10";
    let secondsUntilExpire=((daysUntilExpire*24)*60)*60;
    //let secondsUntilExpire=15;
    return ((Date.now()/1000)+secondsUntilExpire);
}

const User=mongoose.model('User',UserSchema);
module.exports={User};