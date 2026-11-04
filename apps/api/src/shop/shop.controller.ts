import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createOrderSchema, type CreateOrderInput } from "@bpredict/shared";
import { ShopService } from "./shop.service";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { ZodPipe } from "../common/zod.pipe";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

@Controller("shop")
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  view(@CurrentUser() user: AuthUser) {
    return this.shop.view(user.id);
  }

  @Post("orders")
  @HttpCode(200)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput) {
    return this.shop.createOrder(user.id, body);
  }

  @Get("orders")
  list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.shop.listOrders(user.id, limit ? Number(limit) : 20);
  }

  @Get("orders/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.shop.getOrder(user.id, id);
  }
}
