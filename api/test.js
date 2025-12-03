// Simple test endpoint to verify Vercel deployment
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  res.status(200).json({
    success: true,
    message: 'Pulse API is working!',
    timestamp: new Date().toISOString(),
    env: {
      nodeVersion: process.version,
      vercelUrl: process.env.VERCEL_URL || 'not set',
    }
  });
}
