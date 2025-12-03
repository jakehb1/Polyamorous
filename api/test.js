// api/test.js - Health check

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    message: "Polygram API is running"
  });
};
