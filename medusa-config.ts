import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    workerMode: process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "worker"
      | "server",
    databaseUrl: process.env.DATABASE_URL,
    databaseLogging: process.env.NODE_ENV !== "production",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },

  admin: {
    vite: () => {
      return {
        server: {
          allowedHosts: [".dividebzero.in"],
        },
      };
    },
  },
  modules: [
    {
      resolve: "@medusajs/medusa/stock-location",
      options: {
        database: {
          clientUrl: process.env.DATABASE_URL,
        },
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-s3",
            id: "s3",
            options: {
              file_url: process.env.FILE_URL,
              access_key_id: process.env.SUPABASE_ACCESS_KEY_ID,
              secret_access_key: process.env.SUPABASE_SECRET_ACCESS_KEY,
              region: process.env.SUPABASE_REGION,
              bucket: process.env.SUPABASE_BUCKET,
              endpoint: process.env.SUPABASE_ENDPOINT,
              additional_client_config: {
                forcePathStyle: true,
              },

              // ...
            },
          },
        ],
      },
    },

    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/razorpay-payment",
            id: "razorpay",
            options: {
              key_id: process.env.RAZORPAY_ID,
              key_secret: process.env.RAZORPAY_SECRET,
              webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET, // optional
            },
          },
        ],
      },
    },

    {
      resolve: "@medusajs/medusa/cache-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: {
          url: process.env.REDIS_URL,
        },
      },
    },
  ],
});
