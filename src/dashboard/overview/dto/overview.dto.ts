export class OrderSummaryDto {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  cancelled: number;
}

export class RecentOrderDto {
  id: number;
  orderNumber: string;
  date: Date;
  total: number;
  status: string;
  items: number;
}

export class DashboardOverviewDto {
  orderSummary: OrderSummaryDto;
  recentOrders: RecentOrderDto[];
  savedAddresses: number;
  wishlistItems: number;
}
