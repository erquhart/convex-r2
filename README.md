# Convex R2 Component

[![npm version](https://badge.fury.io/js/@convex-dev%2Fr2.svg)](https://badge.fury.io/js/@convex-dev%2Fr2)

**Note: Convex Components are currently in beta.**

<!-- START: Include on https://convex.dev/components -->

Store and serve files with Cloudflare R2.

## Prerequisites

### Cloudflare Account

- [Create a Cloudflare account](https://cloudflare.com)
- [Create an R2 bucket](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- Set the bucket name as an environment variable `R2_BUCKET` in your Convex
  deployment
- Create an API token
  - On the main R2 page in your Cloudflare dashboard, click **Manage R2 API
    Tokens**
  - Click **Create API Token**
  - Edit the token name
  - Set permissions to **Object Read & Write**
  - Under **Specify bucket**, select the bucket you created above
  - Optionally change TTL
  - Click **Create API Token**
- On the next screen you'll be provided with four values that you'll need later:
  - **Token Value**: `R2_TOKEN`
  - **Access Key ID**: `R2_ACCESS_KEY_ID`
  - **Secret Access Key**: `R2_SECRET_ACCESS_KEY`
  - **Endpoint**: `R2_ENDPOINT`

### Convex App

You'll need a Convex App to use the component. Follow any of the [Convex quickstarts](https://docs.convex.dev/home) to set one up.

## Installation

Install the component package:

```ts
npm install @convex-dev/r2
```

Create a `convex.config.ts` file in your app's `convex/` folder and install the component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config";

const app = defineApp();
app.use(r2);

export default app;
```

Set your API credentials using the values you recorded earlier:

```sh
npx convex env set R2_TOKEN=xxxxx
npx convex env set R2_ACCESS_KEY_ID=xxxxx
npx convex env set R2_SECRET_ACCESS_KEY=xxxxx
npx convex env set R2_ENDPOINT=xxxxx
npx convex env set R2_BUCKET=xxxxx
```

Instantiate a R2 Component client in a file in your app's `convex/` folder:

```ts
// convex/example.ts
import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";

export const r2 = new R2(components.r2);

// Example usage: create an action to generate an R2 upload URL
export const generateUploadUrl = action(() => {
  return r2.generateUploadUrl();
});
```

## Uploading and Storing Files

Upload files to R2 by generated upload URL or HTTP Action.

### Uploading files via upload URLs
Arbitrarily large files can be uploaded directly to your backend using a generated upload URL. This requires the client to make 3 requests:

1. Generate an upload URL and object key using a mutation that calls `r2.generateUploadUrl()`.
1. Send a POST request with the object key and file contents to the upload URL.
1. Save the object key into your data model via another mutation.

In the first mutation that generates the upload URL you can control who can upload files to your R2 storage.

#### Calling the upload APIs from a web page
Here's an example of uploading an image via a form submission handler to an upload URL generated by a mutation:

```tsx
// src/App.tsx
import { FormEvent, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export default function App() {
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const sendImage = useMutation(api.messages.sendImage);

  const imageInput = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const [name] = useState(() => "User " + Math.floor(Math.random() * 10000));
  async function handleSendImage(event: FormEvent) {
    event.preventDefault();

    // Step 1: Get a short-lived upload URL
    const { url, key } = await generateUploadUrl();
    // Step 2: POST the file to the URL
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": selectedImage!.type },
      body: selectedImage,
    });
    // Step 3: Save the newly allocated object key to the database
    await sendImage({ key, author: name });

    setSelectedImage(null);
    imageInput.current!.value = "";
  }
  return (
    <form onSubmit={handleSendImage}>
      <input
        type="file"
        accept="image/*"
        ref={imageInput}
        onChange={(event) => setSelectedImage(event.target.files![0])}
        disabled={selectedImage !== null}
      />
      <input
        type="submit"
        value="Send Image"
        disabled={selectedImage === null}
      />
    </form>
  );
}
```

#### Generating the upload URL
An upload URL can be generated by the `generateUploadUrl` function of the R2 component client:

```ts
// convex/messages.ts
TS
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { R2 } from "@convex-dev/r2";

const r2 = new R2(components.r2);

export const generateUploadUrl = mutation((ctx) => {
  return r2.generateUploadUrl();
});
```

This mutation can control who is allowed to upload files.

#### Writing the new object key to the database
Since the object key is returned to the client it is likely you will want to persist it in the database via another mutation:

```ts
// convex/messages.ts
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { R2 } from "@convex-dev/r2";

const r2 = new R2(components.r2);

export const sendImage = mutation({
  args: { key: v.string(), author: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      body: args.key,
      author: args.author,
      format: "image",
    });
  },
});
```

### Uploading files via an HTTP action
The file upload process can be more tightly controlled by leveraging HTTP actions, performing the whole upload flow using a single request.

The custom upload HTTP action can control who can upload files to your Convex storage. But note that the HTTP action request size is currently limited to 20MB. For larger files you need to use upload URLs as described above.

#### Calling the upload HTTP action from a web page
Here's an example of uploading an image via a form submission handler to the `sendImage` HTTP action provided by the R2 component:

The highlighted lines make the actual request to the HTTP action:

```tsx
// src/App.tsx
import { FormEvent, useRef, useState } from "react";

const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL;

export default function App() {
  const imageInput = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  async function handleSendImage(event: FormEvent) {
    event.preventDefault();

    // e.g. https://happy-animal-123.convex.site/r2/sendImage?author=User+123
    const sendImageUrl = new URL(`${convexSiteUrl}/r2/sendImage`);
    sendImageUrl.searchParams.set("author", "Jack Smith");

    await fetch(sendImageUrl, {
      method: "POST",
      headers: { "Content-Type": selectedImage!.type },
      body: selectedImage,
    });

    setSelectedImage(null);
    imageInput.current!.value = "";
  }
  return (
    <form onSubmit={handleSendImage}>
      <input
        type="file"
        accept="image/*"
        ref={imageInput}
        onChange={(event) => setSelectedImage(event.target.files![0])}
        disabled={selectedImage !== null}
      />
      <input
        type="submit"
        value="Send Image"
        disabled={selectedImage === null}
      />
    </form>
  );
}
```

#### Defining the upload HTTP action
A file sent in the HTTP request body can be stored using the storage.store function of the ActionCtx object. This function returns an Id<"_storage"> of the stored file.

From the HTTP action you can call a mutation to write the storage ID to a document in your database.

```ts
// convex/http.ts
import { R2 } from "@convex-dev/r2";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";

const http = httpRouter();

const r2 = new R2(components.r2);

r2.registerRoutes(http, {
  clientOrigin: "http://localhost:5173",
  onSend: internal.messages.sendImage,
});

export default http;
```

The `sendImage` mutation is called by the HTTP action with the object key and request URL as arguments when the file is uploaded. It saves the storage ID to the database:

```ts
// convex/messages.ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { R2 } from "@convex-dev/r2";
const r2 = new R2(components.r2);

export const sendImage = internalMutation({
  args: { key: v.string(), requestUrl: v.string() },
  handler: async (ctx, args) => {
    const author = new URL(args.requestUrl).searchParams.get("author");
    if (!author) {
      throw new Error("Author is required");
    }
    await ctx.db.insert("messages", {
      body: args.key,
      author,
      format: "image",
    });
  },
});
```

## Storing Generated Files
Files can be uploaded to R2 from a client and stored directly, see Upload.

Alternatively, files can be stored after they've been fetched or generated in actions and HTTP actions. For example you might call a third-party API to generate an image based on a user prompt and then store that image in R2.

### Storing files in actions
Storing files in actions is similar to uploading a file via an HTTP action.

The action takes these steps:

1. Fetch or generate an image.
1. Store the image by sending the image URL to the `r2.store` action and receive an object key.
1. Save the object key into your data model via a mutation.

```ts
// convex/images.ts
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { R2 } from "@convex-dev/r2";

const r2 = new R2(components.r2);

export const generateAndStore = action({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    // Not shown: generate imageUrl from `prompt`
    const imageUrl = "https://....";

    // Store the image in R2
    const key = await r2.store(imageUrl);

    // Write `key` to a document
    await ctx.runMutation(internal.images.storeResult, {
      key,
      prompt: args.prompt,
    });
  },
});

export const storeResult = internalMutation({
  args: {
    key: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const { key, prompt } = args;
    await ctx.db.insert("images", { key, prompt });
  },
});
```

## Serving Files

Files stored in R2 can be served to your users by generating a URL pointing to a given file.

### Generating file URLs in queries
The simplest way to serve files is to return URLs along with other data required by your app from queries and mutations.

A file URL can be generated from a object key by the `r2.getUrl` function of the
R2 component client.

```ts
// convex/listMessages.ts
import { components } from "./_generated/api";
import { query, mutation } from "./_generated/server";
import { R2 } from "@convex-dev/r2";

const r2 = new R2(components.r2);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    return Promise.all(
      messages.map(async (message) => ({
        ...message,
        // If the message is an "image" its `body` is an object key
        ...(message.format === "image"
          ? { url: await r2.getUrl(message.body) }
          : {}),
      })),
    );
  },
});
```

File URLs can be used in img elements to render images:

```tsx
// src/App.tsx
function Image({ message }: { message: { url: string } }) {
  return <img src={message.url} height="300px" width="auto" />;
}
```

### Serving files from HTTP actions
You can serve R2 files directly from HTTP actions.

This enables access control at the time the file is served, such as when an image is displayed on a website. But note that the HTTP actions response size is currently limited to 20MB. For larger files you need to use file URLs as described above.

A file Blob object can be returned from the `/r2/get/:key` HTTP action:

```ts
// convex/http.ts
TS
import { R2 } from "@convex-dev/r2";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";

const http = httpRouter();

const r2 = new R2(components.r2);

r2.registerRoutes(http, {
  onSend: internal.example.httpSendImage,
  clientOrigin: "http://localhost:5173",
});

export default http;
```

The URL of the HTTP action can be used directly in img elements to render images:

```tsx
// src/App.tsx
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL;

function Image({ key }: { key: string }) {
  // e.g. https://happy-animal-123.convex.site/r2/get/456
  const getImageUrl = new URL(`${convexSiteUrl}/r2/get/${key}`);
  return <img src={getImageUrl.href} height="300px" width="auto" />;
}
```

## Deleting Files

Files stored in R2 can be deleted from actions via the `r2.delete` function, which accepts an object key.

```ts
// convex/images.ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { R2 } from "@convex-dev/r2";

const r2 = new R2(components.r2);

export const deleteByKey = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await r2.deleteByKey(args.key);
  },
});
```

<!-- END: Include on https://convex.dev/components -->