import Blog from '../models/Blog.js';

/**
 * Check and publish scheduled blogs
 * This function should be called by a cron job
 */
export const checkScheduledBlogs = async () => {
  try {
    const now = new Date();
    
    console.log(`🔍 Checking for scheduled blogs at ${now.toISOString()}`);
    
    // Find all scheduled blogs where the scheduled date has passed
    const scheduledBlogs = await Blog.find({
      status: 'scheduled',
      scheduledPublishDate: { $lte: now }
    });

    if (scheduledBlogs.length === 0) {
      console.log('📋 No scheduled blogs to publish');
      return 0;
    }

    console.log(`📨 Found ${scheduledBlogs.length} scheduled blogs to publish`);

    // Update each blog to published status
    const updatePromises = scheduledBlogs.map(async (blog) => {
      try {
        const publishDate = new Date(blog.scheduledPublishDate);
        console.log(`📝 Publishing blog: "${blog.title}" (scheduled for ${publishDate.toISOString()})`);
        
        blog.status = 'published';
        blog.publishedAt = new Date();
        await blog.save();
        
        console.log(`✅ Published scheduled blog: ${blog.title}`);
        return true;
      } catch (err) {
        console.error(`❌ Failed to publish blog "${blog.title}":`, err);
        return false;
      }
    });

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r === true).length;
    
    console.log(`✅ Successfully published ${successCount} of ${scheduledBlogs.length} scheduled blogs`);
    
    return successCount;
  } catch (error) {
    console.error('❌ Error checking scheduled blogs:', error);
    throw error;
  }
};