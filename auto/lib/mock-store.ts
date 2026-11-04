import { Post, PostTarget, SocialAccount, TargetStatus } from "@/types";

interface MockDatabase {
  posts: Post[];
  accounts: SocialAccount[];
}

const globalForMock = globalThis as unknown as {
  mockDatabase?: MockDatabase;
};

const initialData: MockDatabase = {
  posts: [
    {
      id: "demo-post-1",
      user_id: "mock-user-123",
      caption: "Launching our new project today! 🚀 Built with Next.js and official APIs. #buildinpublic #viral",
      youtube_title: "Launching our new project today! 🚀",
      video_storage_path: "mock-user-123/demo-post-1/demo_video.mp4",
      video_filename: "demo_video.mp4",
      video_size: 14 * 1024 * 1024,
      video_duration: 32,
      video_width: 1080,
      video_height: 1920,
      post_mode: "now",
      scheduled_at: null,
      timezone: "UTC",
      status: "completed",
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      targets: [
        {
          id: "target-ig-1",
          post_id: "demo-post-1",
          user_id: "mock-user-123",
          platform: "instagram",
          status: "published",
          platform_post_id: "mock_ig_101",
          platform_url: "https://www.instagram.com/p/mock_demo_ig/",
          error_code: null,
          error_message: null,
          attempt_count: 1,
          started_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          published_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        },
        {
          id: "target-fb-1",
          post_id: "demo-post-1",
          user_id: "mock-user-123",
          platform: "facebook",
          status: "published",
          platform_post_id: "mock_fb_101",
          platform_url: "https://www.facebook.com/watch/?v=mock_demo_fb",
          error_code: null,
          error_message: null,
          attempt_count: 1,
          started_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          published_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        },
      ],
    },
  ],
  accounts: [],
};


export const globalStore: MockDatabase =
  globalForMock.mockDatabase || initialData;

if (process.env.NODE_ENV !== "production") {
  globalForMock.mockDatabase = globalStore;
}



export const mockStore = {
  getPosts: (userId?: string) =>
    userId ? globalStore.posts.filter((p) => p.user_id === userId) : [],
  getPostById: (id: string, userId?: string) =>
    globalStore.posts.find((p) => p.id === id && (!userId || p.user_id === userId)) || null,
  addPost: (post: Post) => {
    globalStore.posts.unshift(post);
    return post;
  },
  updatePostStatus: (id: string, status: any) => {
    const post = globalStore.posts.find((p) => p.id === id);
    if (post) {
      post.status = status;
      post.updated_at = new Date().toISOString();
    }
  },
  updateTarget: (postId: string, platform: string, update: Partial<PostTarget>) => {
    const post = globalStore.posts.find((p) => p.id === postId);
    if (post && post.targets) {
      const target = post.targets.find((t) => t.platform === platform);
      if (target) {
        Object.assign(target, update, { updated_at: new Date().toISOString() });
      }
    }
  },
  deletePost: (id: string) => {
    globalStore.posts = globalStore.posts.filter((p) => p.id !== id);
  },
  deleteTarget: (postId: string, targetId: string) => {
    const post = globalStore.posts.find((p) => p.id === postId);
    if (post && post.targets) {
      post.targets = post.targets.filter((t) => t.id !== targetId);
    }
  },
  getAccounts: (userId?: string) =>
    userId ? globalStore.accounts.filter((a) => a.user_id === userId) : [],
  upsertAccount: (account: SocialAccount) => {
    globalStore.accounts = globalStore.accounts.filter(
      (a) => !(a.user_id === account.user_id && a.provider === account.provider)
    );
    globalStore.accounts.push(account);
  },
  disconnectAccount: (provider: string, userId?: string) => {
    globalStore.accounts = globalStore.accounts.filter((a) => {
      if (a.provider !== provider) return true;
      if (userId && a.user_id !== userId) return true;
      return false;
    });
  },
};

