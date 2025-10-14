import { inject, type InjectionKey, type Plugin } from "vue";
import { type Caido } from "@caido/sdk-frontend";

import { type FrontendSDK } from "@/types";

const KEY: InjectionKey<Caido<FrontendSDK['backend']>> = Symbol("FrontendSDK");

// This is the plugin that will provide the FrontendSDK to VueJS
// To access the frontend SDK from within a component, use the `useSDK` function.
export const SDKPlugin: Plugin = (app, sdk: Caido<FrontendSDK['backend']>) => {
  app.provide(KEY, sdk);
};

// This is the function that will be used to access the FrontendSDK from within a component.
export const useSDK = () => {
  return inject(KEY) as Caido<FrontendSDK['backend']>;
};
