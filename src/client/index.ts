import {
  Expand,
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
  httpActionGeneric,
  HttpRouter,
} from "convex/server";
import { GenericId } from "convex/values";
import { api } from "../component/_generated/api";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class R2 {
  public readonly bucket: string;
  public readonly endpoint: string;
  public readonly accessKeyId: string;
  public readonly secretAccessKey: string;
  public r2: S3Client;
  constructor(
    public component: UseApi<typeof api>,
    options: {
      R2_BUCKET?: string;
      R2_ENDPOINT?: string;
      R2_ACCESS_KEY_ID?: string;
      R2_SECRET_ACCESS_KEY?: string;
    } = {}
  ) {
    this.bucket = options?.R2_BUCKET ?? process.env.R2_BUCKET!;
    this.endpoint = options?.R2_ENDPOINT ?? process.env.R2_ENDPOINT!;
    this.accessKeyId =
      options?.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID!;
    this.secretAccessKey =
      options?.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY!;
    this.r2 = new S3Client({
      region: "auto",
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
  }
  async generateUploadUrl() {
    const key = crypto.randomUUID();
    const url = await getSignedUrl(
      this.r2,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return { key, url };
  }
  async store(ctx: RunActionCtx, url: string) {
    return await ctx.runAction(this.component.lib.store, {
      url,
      bucket: this.bucket,
      endpoint: this.endpoint,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });
  }
  async getUrl(key: string) {
    return await getSignedUrl(
      this.r2,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
  async deleteByKey(ctx: RunActionCtx, key: string) {
    await ctx.runAction(this.component.lib.deleteObject, {
      key,
      bucket: this.bucket,
      endpoint: this.endpoint,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });
  }
  registerRoutes(
    http: HttpRouter,
    {
      pathPrefix = "/r2",
      onSend,
      clientOrigin = process.env.CLIENT_ORIGIN!,
    }: {
      onSend?: FunctionReference<
        "mutation",
        "internal",
        { key: string; requestUrl: string }
      >;
      clientOrigin?: string;
      pathPrefix?: string;
    } = {}
  ) {
    http.route({
      pathPrefix: `${pathPrefix}/get/`,
      method: "GET",
      handler: httpActionGeneric(async (ctx, request) => {
        const { pathname } = new URL(request.url);
        const key = pathname.split("/").pop()!;
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        const response = await this.r2.send(command);

        if (!response.Body) {
          return new Response("Image not found", {
            status: 404,
          });
        }
        return new Response(await response.Body.transformToByteArray());
      }),
    });
    http.route({
      path: `${pathPrefix}/send`,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const blob = await request.blob();
        const key = crypto.randomUUID();
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: blob,
        });
        await this.r2.send(command);

        if (onSend) {
          await ctx.runMutation(onSend, { key, requestUrl: request.url });
        }

        return new Response(null, {
          status: 200,
          // CORS headers
          headers: new Headers({
            // e.g. https://mywebsite.com, configured on your Convex dashboard
            "Access-Control-Allow-Origin": clientOrigin,
            Vary: "origin",
          }),
        });
      }),
    });
    // Pre-flight request for /sendImage
    http.route({
      path: `${pathPrefix}/send`,
      method: "OPTIONS",
      handler: httpActionGeneric(async (_, request) => {
        // Make sure the necessary headers are present
        // for this to be a valid pre-flight request
        const headers = request.headers;
        if (
          headers.get("Origin") !== null &&
          headers.get("Access-Control-Request-Method") !== null &&
          headers.get("Access-Control-Request-Headers") !== null
        ) {
          return new Response(null, {
            headers: new Headers({
              "Access-Control-Allow-Origin": clientOrigin,
              "Access-Control-Allow-Methods": "POST",
              "Access-Control-Allow-Headers": "Content-Type, Digest",
              "Access-Control-Max-Age": "86400",
            }),
          });
        } else {
          return new Response();
        }
      }),
    });
  }

  /**
   * For easy re-exporting.
   * Apps can do
   * ```ts
   * export const { deleteByKey } = r2.api();
   * ```
   */
  api() {
    return {
      deleteByKey: (ctx: RunActionCtx, key: string) => {
        return this.deleteByKey(ctx, key);
      },
    };
  }
}

/* Type utils follow */
type RunActionCtx = {
  runAction: GenericActionCtx<GenericDataModel>["runAction"];
};

export type OpaqueIds<T> =
  T extends GenericId<infer _T>
    ? string
    : T extends (infer U)[]
      ? OpaqueIds<U>[]
      : T extends object
        ? { [K in keyof T]: OpaqueIds<T[K]> }
        : T;

export type UseApi<API> = Expand<{
  [mod in keyof API]: API[mod] extends FunctionReference<
    infer FType,
    "public",
    infer FArgs,
    infer FReturnType,
    infer FComponentPath
  >
    ? FunctionReference<
        FType,
        "internal",
        OpaqueIds<FArgs>,
        OpaqueIds<FReturnType>,
        FComponentPath
      >
    : UseApi<API[mod]>;
}>;
