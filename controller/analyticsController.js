// server/controller/analyticsController.js

/**
 * Returns public analytics configuration for the frontend.
 * Only exposes safe-to-send values (host + website ID).
 * Never expose secrets here.
 */
export const getAnalyticsConfig = async (req, res) => {
  try {
    const enabled = process.env.UMAMI_ENABLED === 'true';
    const host = process.env.UMAMI_HOST || '';
    const websiteId = process.env.UMAMI_WEBSITE_ID || '';

    if (!enabled || !host || !websiteId) {
      return res.status(200).json({
        success: true,
        data: { enabled: false }
      });
    }

    // Cache for 5 minutes — config rarely changes
    res.setHeader('Cache-Control', 'public, max-age=300');

    res.status(200).json({
      success: true,
      data: {
        enabled: true,
        provider: 'umami',
        host,
        websiteId
      }
    });
  } catch (error) {
    console.error('❌ Analytics config error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};