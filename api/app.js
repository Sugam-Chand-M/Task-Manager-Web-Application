const express=require('express');
const app=express();
const cors=require("cors");
const mongoose=require('./db/mongoose');
const bodyParser=require('body-parser');
const jwt=require('jsonwebtoken');

const corsOptions ={
    origin:'*', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200,
 }

 app.use(cors(corsOptions));

// Mongoose Models
/*const {List}=require('./db/models/list.model');
const {Task}=require('./db/models/task.model');*/
const {List,Task,User}=require('./db/models');
//const { User } = require('./db/models/user.model');

// Middleware
// Load middleware
app.use(bodyParser.json());

// CORS headers middleware
app.use(cors());
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", '*'); // update to match the domain you will make the request from
    res.header("Acess-Control-Allow-Methods","GET,POST,HEAD,OPTIONS,PUT,PATCH,DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header('Access-Control-Expose-Headers','x-access-token, x-refresh-token');
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });
  /*app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
        return res.status(200).json({});
    };
    next();
});*/

// check whether the request has a valid JWT access token
let authenticate=(req,res,next)=>{
    let token=req.header('x-access-token');
    //verify the JWT
    jwt.verify(token,User.getJWTSecret(),(err,decoded)=>{
        if(err){
            // there was an error, jwt is invalid, do not authenticate
            res.status(401).send(err);
        }
        else{
            // jwt is valid
            req.user_id=decoded._id;
            next();
        }
    });
}

// verify refresh token middleware 
let verifySession=(req,res,next)=>{
    // grab the refresh token from the request header
    let refreshToken=req.header('x-refresh-token');
    // grab the _id from the request header
    let _id=req.header('_id');
    User.findByIdAndToken(_id,refreshToken).then((user)=>{
        if(!user){
            // user couldn't be found
            return Promise.reject({
                'error':'User not found. make sure that the refresh token and user id are correct'
            });
        }
        // if the code reaches here - the user was found , therefore the refresh token exists in the database , but we still have to check if it has expired or not
        req.user_id=user._id;
        req.userObject=user;
        req.refreshToken=refreshToken;
        let isSessionValid=false;
        user.sessions.forEach((session)=>{
            if(session.token===refreshToken){
                // check if the session has expired
                if(User.hasRefreshTokenExpired(session.expiresAt)===false){
                    // refresh token has not expired
                    isSessionValid=true;
                }
            }
        });
        if(isSessionValid){
            // the session is valid
            next();
        }
        else{
            // the session is not valid
            return Promise.reject({
                'error':'Refresh token has expired or the session is invalid'
            });
        }
    }).catch((e)=>{
        res.status(401).send(e);
    });
}

// Route Handlers

// List Routes
// GET /lists ,Purpose: Get all lists
app.get('/lists',authenticate,(req,res)=>{
    //res.send("Hello World!");
    // to return an array of all the lists in the database that belong to the authenticated user
    List.find({
        _userId:req.user_id
    }).then((lists)=>{
        res.send(lists);
    }).catch((e)=>{
        res.send(e);
    });
});

// POST /lists ,Purpose: Create a list
app.post('/lists',authenticate,(req,res)=>{
    // crete a new list and return the new list document back go the user along with the id
    // list info will be passed through the JSON request body
    let title=req.body.title;
    let newList=new List({
        title,
        _userId:req.user_id
    });
    newList.save().then((listDoc)=>{
        // full document is returned
        res.send(listDoc);
    });
});

// PATCH /lists/:id ,Purpose: update a specified list
app.patch('/lists/:id',authenticate,(req,res)=>{
    // updating the specified list with new values specified in the JSON body of the request
    List.findOneAndUpdate({_id:req.params.id,_userId:req.user_id},{
        $set:req.body
    }).then(()=>{
        //res.sendStatus(200);
        res.send({'message':'updated successfully'});
    });
});

// DELETE /lists/:id
app.delete('/lists/:id',authenticate,(req,res)=>{
    // delete the specified list
    List.findOneAndRemove({
        _id:req.params.id,
        _userId:req.user_id
    }).then((removedListDoc)=>{
        res.send(removedListDoc);
        // delete all the tasks that are in the deleted list
        deleteTasksFromList(removedListDoc._id);
    });
});

// GET /lists/:listId/tasks, Purpose: get all tasks in a specified list
app.get('/lists/:listId/tasks',authenticate,(req,res)=>{
    // return all tasks that belong to a specific list
    Task.find({
        _listId: req.params.listId
    }).then((tasks)=>{
        res.send(tasks);
    });
});


// POST /lists/:listId/tasks , Purpose: create a new task in a specific list
app.post('/lists/:listId/tasks',authenticate,(req,res)=>{
    // create a new task in a list specified by listId
    List.findOne({
        _id:req.params.listId,
        _userId:req.user_id
    }).then((list)=>{
        if(list){
            // list object with the specified conditions was found, therefore the currently authenticated user can create new tasks
            return true;
        }
        // else the user object is undefined
        return false;
    }).then((canCreateTask)=>{
        if(canCreateTask){
            let newTask=new Task({
            title:req.body.title,
            _listId:req.params.listId
            });
            newTask.save().then((newTaskDoc)=>{
            res.send(newTaskDoc);
            });
        }
        else{
            res.sendStatus(404);
        }
    });
    
});

// PATCH /lists/:listId/tasks/:taskId , Purpose: update an missing task
app.patch('/lists/:listId/tasks/:taskId',authenticate,(req,res)=>{
    // update an existing task specified by taskId
    List.findOne({
        _id:req.params.listId,
        _userId:req.user_id
    }).then((list)=>{
        if(list){
            // list object with the specified conditions was found, therefore the currently authenticated user can update to tasks within this list
            return true;
        }
        // else the user object is undefined
        return false;
    }).then((canUpdateTasks)=>{
        if(canUpdateTasks){
            // currently authenticated user can update tasks 
            Task.findOneAndUpdate({
                _id:req.params.taskId,
                _listId:req.params.listId
            },{
            $set:req.body
            }).then(()=>{
                //res.sendStatus(200);
                res.send({message:'Updated Successfully'});
            });
        }
        else{
            res.sendStatus(404);
        }
    });
    
});

// DELETE /lists/:listId/tasks/:taskId , Purpose: Delete a task
app.delete('/lists/:listId/tasks/:taskId',authenticate,(req,res)=>{
    List.findOne({
        _id:req.params.listId,
        _userId:req.user_id
    }).then((list)=>{
        if(list){
            // list object with the specified conditions was found, therefore the currently authenticated user can update to tasks within this list
            return true;
        }
        // else the user object is undefined
        return false;
    }).then((canDeleteTasks)=>{
        if(canDeleteTasks){
            Task.findOneAndRemove({
                _id:req.params.taskId,
                _listId:req.params.listId
            }).then((removedTaskDoc)=>{
                res.send(removedTaskDoc);
            });
        }
        else{
            res.sendStatus(404);
        }
    });
});

// User routes
// POST /users , Purpose: sign up
app.post('/users',(req,res)=>{
    // user sign up
    let body=req.body;
    let newUser=new User(body);
    newUser.save().then(()=>{
        return newUser.createSession();
    }).then((refreshToken)=>{
        // session created successfully - refreshToken returned
        // generate an access auth token for the user
        return newUser.generateAccessAuthToken().then((accessToken)=>{
            // access auth token generated successfully, returning an object containing the auth tokens
            return {accessToken,refreshToken};
        });
    }).then((authTokens)=>{
        // construct and send the response to the user with their auth tokens in the header and the user object in the body
        res.header('x-refresh-token',authTokens.refreshToken)
        .header('x-access-token',authTokens.accessToken)
        .send(newUser);
    }).catch((e)=>{
        res.status(400).send(e);
    });
});

// POST /users/login , Purpose: Login
app.post('/users/login',(req,res)=>{
    let email=req.body.email;
    let password=req.body.password;
    User.findByCredentials(email,password).then((user)=>{
        return user.createSession().then((refreshToken)=>{
            return user.generateAccessAuthToken().then((accessToken)=>{
                return {accessToken,refreshToken};
            });
        }).then((authTokens)=>{
            res.header('x-refresh-token',authTokens.refreshToken)
            .header('x-access-token',authTokens.accessToken)
            .send(user);
        });
    }).catch((e)=>{
        res.status(400).send(e);
    });
});

// GET /users/me/access-token , Purpose: Generates and return an access-token
app.get('/users/me/access-token',verifySession,(req,res)=>{
    // user/caller is authenticated
    req.userObject.generateAccessAuthToken().then((accessToken)=>{
        res.header('x-access-token',accessToken).send({accessToken});
    }).catch((e)=>{
        res.status(400).send(e);
    });
});

// Helper Methods
let deleteTasksFromList=(_listId)=>{
    Task.deleteMany({
        _listId
    }).then(()=>{
        console.log("Tasks from "+_listId+" were deleted!!");
    });
}

app.listen(3000,()=>{
    console.log("Server is listening on port 3000");
})