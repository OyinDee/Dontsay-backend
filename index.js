require("dotenv").config();
const mongoose = require("mongoose");
const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

mongoose.Query.prototype.timeout = 20000;
mongoose
  .connect(process.env.URI)
  .then(() => console.log("MONGODB has connected"))
  .catch((err) => console.log("Error in mongodb connection", err));

const { server } = createApp();

server.listen(PORT, () => {
  console.log(`app listening on PORT ${PORT}`);
});
