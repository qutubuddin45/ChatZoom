const jwt = require("jsonwebtoken");
require("dotenv").config();


const JWT_SECRET = process.env.JWT_SECRET;


module.exports = (req, res, next) => {
  
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  // ❌ If token is missing
  if (!token) {
    return res.status(401).send("No token provided");
  }

  try {
   
    req.user = jwt.verify(token, JWT_SECRET);
    next(); // proceed to next middleware or route handler
  } catch (error) {
    // ❌ Invalid token
    res.status(401).send("Invalid token");
  }
};
