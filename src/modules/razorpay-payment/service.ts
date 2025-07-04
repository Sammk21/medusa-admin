//@ts-nocheck
import { AbstractPaymentProvider } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/framework/types";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  PaymentSessionStatus,
  ProviderWebhookPayload,
  WebhookActionResult,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
} from "@medusajs/framework/types";
import { MedusaError, BigNumber } from "@medusajs/framework/utils";

const Razorpay = require("razorpay");

type Options = {
  key_id: string;
  key_secret: string;
  webhook_secret?: string;
};

type InjectedDependencies = {
  logger: Logger;
};

class RazorpayPaymentProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "razorpay";

  protected logger_: Logger;
  protected options_: Options;
  protected razorpay_: any;

  constructor(container: InjectedDependencies, options: Options) {
    super(container, options);

    this.logger_ = container.logger;
    this.options_ = options;

    // Initialize Razorpay instance
    this.razorpay_ = new Razorpay({
      key_id: options.key_id,
      key_secret: options.key_secret,
    });
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.key_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Razorpay key_id is required in the provider's options."
      );
    }

    if (!options.key_secret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Razorpay key_secret is required in the provider's options."
      );
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input;

    try {
      // Convert amount to smallest currency unit (paise for INR)
      const amountInSmallestUnit = Math.round(
        parseFloat(amount.toString()) * 100
      );

      // Create Razorpay order
      const options = {
        amount: amountInSmallestUnit,
        currency: currency_code.toUpperCase(),
        receipt: `order_${Date.now()}`,
        notes: {
          medusa_payment_session: true,
          customer_email: context.customer?.email || "",
          customer_id: context.customer?.id || "",
        },
      };

      const order = await this.razorpay_.orders.create(options);

      this.logger_.info(`Razorpay order created: ${order.id}`);

      return {
        data: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          created_at: order.created_at,
          // Include key_id for frontend integration
          key_id: this.options_.key_id,
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to create Razorpay order: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to initiate payment with Razorpay: ${error.message}`
      );
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const { data } = input;

    try {
      // Fetch the order from Razorpay to check its status
      const order = await this.razorpay_.orders.fetch(data.id);

      this.logger_.info(`Authorizing Razorpay payment for order: ${order.id}`);

      // For now, we'll consider the payment authorized if the order exists
      // In a real implementation, you might want to verify payment signature here
      // or wait for webhook confirmation

      return {
        status: "authorized" as PaymentSessionStatus,
        data: {
          ...data,
          order_status: order.status,
          authorized_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger_.error(
        `Failed to authorize Razorpay payment: ${error.message}`
      );
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to authorize payment: ${error.message}`
      );
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const { data } = input;

    try {
      // In Razorpay, payments are usually captured automatically
      // But you can also manually capture them if needed
      this.logger_.info(`Capturing Razorpay payment for order: ${data.id}`);

      return {
        data: {
          ...data,
          captured_at: new Date().toISOString(),
          status: "captured",
        },
      };
    } catch (error) {
      this.logger_.error(
        `Failed to capture Razorpay payment: ${error.message}`
      );
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to capture payment: ${error.message}`
      );
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const { data } = input;

    try {
      const order = await this.razorpay_.orders.fetch(data.id);

      // Map Razorpay order status to Medusa payment status
      let status: PaymentSessionStatus;

      switch (order.status) {
        case "created":
          status = "pending";
          break;
        case "attempted":
          status = "pending";
          break;
        case "paid":
          status = "authorized";
          break;
        default:
          status = "pending";
      }

      return {
        status,
        data: {
          ...data,
          order_status: order.status,
        },
      };
    } catch (error) {
      this.logger_.error(
        `Failed to get Razorpay payment status: ${error.message}`
      );
      return {
        status: "pending",
      };
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload;

    try {
      // Verify webhook signature if webhook_secret is provided
      if (this.options_.webhook_secret) {
        const crypto = require("crypto");
        const expectedSignature = headers["x-razorpay-signature"];
        const body = typeof rawData === "string" ? rawData : rawData.toString();

        const hmac = crypto.createHmac("sha256", this.options_.webhook_secret);
        hmac.update(body);
        const generatedSignature = hmac.digest("hex");

        if (expectedSignature !== generatedSignature) {
          throw new Error("Invalid webhook signature");
        }
      }

      const event = data.event;
      const paymentEntity = data.payload?.payment?.entity;
      const orderEntity = data.payload?.order?.entity;

      switch (event) {
        case "payment.authorized":
          return {
            action: "authorized",
            data: {
              session_id: orderEntity?.receipt || paymentEntity?.order_id,
              amount: new BigNumber(paymentEntity?.amount || 0),
            },
          };

        case "payment.captured":
          return {
            action: "captured",
            data: {
              session_id: orderEntity?.receipt || paymentEntity?.order_id,
              amount: new BigNumber(paymentEntity?.amount || 0),
            },
          };

        case "payment.failed":
          return {
            action: "failed",
            data: {
              session_id: orderEntity?.receipt || paymentEntity?.order_id,
              amount: new BigNumber(paymentEntity?.amount || 0),
            },
          };

        default:
          return {
            action: "not_supported",
            data: {
              session_id: "",
              amount: new BigNumber(0),
            },
          };
      }
    } catch (error) {
      this.logger_.error(`Webhook processing failed: ${error.message}`);
      return {
        action: "failed",
        data: {
          session_id: "",
          amount: new BigNumber(0),
        },
      };
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const { amount, currency_code, data } = input;

    try {
      // For Razorpay, we might need to create a new order if amount changes significantly
      // For now, we'll just update the stored data
      return {
        data: {
          ...data,
          updated_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to update Razorpay payment: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to update payment: ${error.message}`
      );
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const { data } = input;

    try {
      const order = await this.razorpay_.orders.fetch(data.id);
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        created_at: order.created_at,
      };
    } catch (error) {
      this.logger_.error(
        `Failed to retrieve Razorpay payment: ${error.message}`
      );
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to retrieve payment: ${error.message}`
      );
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    // Razorpay doesn't support deleting orders
    // Return the same data
    return {
      data: input.data,
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // Razorpay orders cannot be cancelled directly
    // They expire automatically after a certain time
    return {
      data: {
        ...input.data,
        cancelled_at: new Date().toISOString(),
      },
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // Basic refund implementation - you can enhance this later
    const { amount, data } = input;

    try {
      // For now, just mark as refunded
      // In a full implementation, you'd call Razorpay's refund API
      return {
        data: {
          ...data,
          refunded_amount: amount,
          refunded_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to refund Razorpay payment: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Failed to refund payment: ${error.message}`
      );
    }
  }
}

export default RazorpayPaymentProviderService;
