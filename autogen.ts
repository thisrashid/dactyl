import { Application } from "./Application.ts";
import {
  ApplicationConfig,
  OpenApiSpecRoot,
  OasPathsRoot,
  Newable,
  ControllerMetadata,
  DocDefinition,
  HttpMethod,
  RouteArgument,
  ArgsType,
} from "./types.ts";

import { getControllerOwnMeta } from "./metadata.ts";

/** 
 * OpenAPI Specification autogeneration builder class.
 * 
 * Programatically invoked by providing an `Application` class,
 * `OasAutogenBuilder` inspects the `Application` `Controller`
 * metadata and builds an OpenAPI compliant JSON file.
*/
export class OasAutogenBuilder {
  #appConfig: ApplicationConfig;
  #title: string;
  #desc: string;
  #applicationVersion: string;

  static OAS_VERSION: string = "3.0.0";
  static APP_VERSION: string = "1.0.0";
  static DEFAULT_TITLE: string =
    `OpenAPI Spec ${OasAutogenBuilder.OAS_VERSION} compliant documentation`;
  static DEFAULT_DESC: string = "Autogenerated OAS documentation by Dactyl";

  public constructor(app: Application) {
    this.#appConfig = app.getAppConfig();

    // set defaults
    this.#title = OasAutogenBuilder.DEFAULT_TITLE;
    this.#desc = OasAutogenBuilder.DEFAULT_DESC;
    this.#applicationVersion = OasAutogenBuilder.APP_VERSION;
  }
  /**
   * Add title for field `openApiDoc.info.title`. Defaults
   * to `OpenAPI Spec ${OAS_VERSION} compliant documentation`
   */
  public addTitle(title: string): OasAutogenBuilder {
    this.#title = title;
    return this;
  }
  /**
   * Add description for field `openApiDoc.info.description`. Defaults
   * to "Autogenerated OAS documentation by Dactyl"
   */
  public addDesc(desc: string): OasAutogenBuilder {
    this.#desc = desc;
    return this;
  }
  /**
   * Add version for field `openApiDoc.info.version`. Defaults
   * to "1.0.0"
   */
  public addApplicationVersion(version: string): OasAutogenBuilder {
    this.#applicationVersion = version;
    return this;
  }
  /**
   * build action: writes OpenApi compliant JSON file to the specified
   * `path`.
   */
  public build(path: string): void {
    const OAS_ROOT: OpenApiSpecRoot = {
      openapi: OasAutogenBuilder.OAS_VERSION,
      info: {
        title: this.#title,
        version: this.#applicationVersion,
        description: this.#desc,
      },
      paths: {},
      components: {
        schemas: {},
        responses: {},
        parameters: {},
        examples: {},
        requestBodies: {},
        headers: {},
        securitySchemes: {},
        links: {},
        callbacks: {},
      },
    };
    const paths: OasPathsRoot = {};
    const controllers: Array<Newable<any>> = this.#appConfig.controllers;
    for (const controller of controllers) {
      const meta: ControllerMetadata | undefined = getControllerOwnMeta(
        controller,
      );
      // Skip non controller Newables as they do not offer any routes
      if (!meta || !meta.prefix) continue;

      const { prefix, routes, docs, defaultResponseCodes, args, argTypes }:
        ControllerMetadata = meta;

      for (const [, routeDef] of routes.entries()) {
        // find doc metadata for this given route
        const docDef: DocDefinition | undefined = docs.find(
          (docDef: DocDefinition): boolean =>
            docDef.docFor === routeDef.methodName,
        );
        // look for default response code here. If this is absent,
        // set default 200/201 based on HttpMethod
        const code: number = defaultResponseCodes.get(routeDef.methodName) ??
          (routeDef.requestMethod === HttpMethod.POST ? 201 : 200);

        const filteredArgs: Array<RouteArgument> = args.filter(
          (arg: RouteArgument): boolean =>
            arg.argFor === routeDef.methodName &&
            arg.type != ArgsType.BODY && arg.type != ArgsType.CONTEXT &&
            arg.type != ArgsType.REQUEST && arg.type != ArgsType.RESPONSE,
        ).map((arg: RouteArgument): any =>
          arg.type == ArgsType.PARAM
            ? {
              ...arg,
              type: "path",
            }
            : arg
        );

        const filteredArgTypes: Array<string> =
          argTypes.get(routeDef.methodName as string) ?? [];

        // TODO replace :id with {id} etc for all path params
        const requestPath: string = prefix + routeDef.path;

        // If the path doesn't exist in the doc yet, add it here
        if (!paths[requestPath]) paths[requestPath] = {};

        // to path, add the new method.
        paths[requestPath][routeDef.requestMethod] = {
          description: docDef?.model.description ??
            routeDef.methodName as string,
          responses: {
            [code]: { description: "" },
          },
          parameters: filteredArgs.map((
            arg: RouteArgument,
            index: number,
          ): any => ({
            name: arg.key,
            in: arg.type,
            schema: {
              type: filteredArgTypes[index],
            },
          })),
        };
      }
      OAS_ROOT.paths = paths;
    }
    console.log(JSON.stringify(OAS_ROOT, null, 2));
  }
}