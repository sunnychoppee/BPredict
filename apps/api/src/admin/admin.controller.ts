import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { adminAdjustSchema, adminEconomySchema, adminFreezeSchema, adminProductSchema, adminVipSchema } from "@bpredict/shared";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";

function parse<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

function lim(q?: string) {
  return Math.min(200, Math.max(1, Number(q) || 50));
}

/** Ops console API. Every mutating call is recorded in `admin_actions`. */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  @Get("actions")
  actions(@Query("limit") limit?: string) {
    return this.admin.actions(lim(limit));
  }

  @Get("economy")
  economy() {
    return this.admin.economyParams();
  }

  @Put("economy")
  setEconomy(@CurrentUser() a: AuthUser, @Body() body: unknown) {
    return this.admin.setEconomyParam(a.id, parse(adminEconomySchema, body));
  }

  @Get("products")
  products() {
    return this.admin.products();
  }

  @Patch("products/:id")
  updateProduct(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.admin.updateProduct(a.id, id, parse(adminProductSchema, body));
  }

  @Get("users")
  users(@Query("q") q = "", @Query("limit") limit?: string) {
    return this.admin.searchUsers(q, lim(limit));
  }

  @Get("users/:id")
  user(@Param("id") id: string) {
    return this.admin.user(id);
  }

  @Get("users/:id/ledger")
  ledger(@Param("id") id: string, @Query("limit") limit?: string, @Query("before") before?: string) {
    return this.admin.userLedger(id, lim(limit), before);
  }

  @Post("users/:id/adjust")
  adjust(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.admin.adjust(a.id, id, parse(adminAdjustSchema, body));
  }

  @Post("users/:id/freeze")
  freeze(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.admin.freeze(a.id, id, parse(adminFreezeSchema, body));
  }

  @Post("users/:id/vip")
  vip(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.admin.vip(a.id, id, parse(adminVipSchema, body));
  }

  @Get("payments")
  payments(@Query("status") status?: string, @Query("limit") limit?: string, @Query("before") before?: string) {
    return this.admin.payments(status || undefined, lim(limit), before);
  }

  @Get("rounds")
  rounds(@Query("table") table = "btc-updown", @Query("limit") limit?: string, @Query("before") before?: string) {
    return this.admin.rounds(table, lim(limit), before);
  }
}
