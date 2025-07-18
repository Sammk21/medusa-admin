import RazorpayPaymentProviderService from "./service";
import { ModuleProvider, Modules } from "@medusajs/framework/utils";

export default ModuleProvider(Modules.PAYMENT, {
  services: [RazorpayPaymentProviderService],
});
