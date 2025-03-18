import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, Raw } from 'typeorm';
import { Order, OrderStatus } from '../order/order.entity';
import { Customer } from '../customer/customer.entity';
import { Product } from '../product/product.entity';
import { OrderItem } from '../order/order-item.entity';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(
        @InjectRepository(Order)
        private orderRepository: Repository<Order>,
        @InjectRepository(Customer)
        private customerRepository: Repository<Customer>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        @InjectRepository(OrderItem)
        private orderItemRepository: Repository<OrderItem>,
    ) {}

    async getDashboardSummary() {
        try {
            // Get current date and previous date for comparison
            const now = new Date();
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(now.getDate() - 30);

            const sixtyDaysAgo = new Date(now);
            sixtyDaysAgo.setDate(now.getDate() - 60);

            // Get total sales (delivered and completed orders)
            const salesResult = await this.orderRepository
                .createQueryBuilder('order')
                .select('SUM(order.total)', 'totalSales')
                .where('order.status IN (:...statuses)', {
                    statuses: [OrderStatus.COMPLETED, OrderStatus.DELIVERED],
                })
                .getRawOne();

            // Get total sales for previous period for comparison
            const previousSalesResult = await this.orderRepository
                .createQueryBuilder('order')
                .select('SUM(order.total)', 'totalSales')
                .where('order.status IN (:...statuses)', {
                    statuses: [OrderStatus.COMPLETED, OrderStatus.DELIVERED],
                })
                .andWhere('order.created_at BETWEEN :start AND :end', {
                    start: sixtyDaysAgo,
                    end: thirtyDaysAgo,
                })
                .getRawOne();

            // Calculate sales change percentage
            const currentSales = parseFloat(salesResult.totalSales || '0');
            const previousSales = parseFloat(
                previousSalesResult.totalSales || '0',
            );
            let salesChangePercentage = 0;

            if (previousSales > 0) {
                salesChangePercentage =
                    ((currentSales - previousSales) / previousSales) * 100;
            }

            // Get counts for orders, customers, products
            const totalOrders = await this.orderRepository.count();
            const totalCustomers = await this.customerRepository.count();
            const totalProducts = await this.productRepository.count();

            // Get previous period counts for comparison
            const previousOrders = await this.orderRepository.count({
                where: {
                    createdAt: Between(sixtyDaysAgo, thirtyDaysAgo),
                },
            });

            const previousCustomers = await this.customerRepository.count({
                where: {
                    createdAt: Between(sixtyDaysAgo, thirtyDaysAgo),
                },
            });

            const previousProducts = await this.productRepository.count({
                where: {
                    createdAt: Between(sixtyDaysAgo, thirtyDaysAgo),
                },
            });

            // Calculate change percentages
            const ordersChangePercentage =
                previousOrders > 0
                    ? ((totalOrders - previousOrders) / previousOrders) * 100
                    : 0;

            const customersChangePercentage =
                previousCustomers > 0
                    ? ((totalCustomers - previousCustomers) /
                          previousCustomers) *
                      100
                    : 0;

            const productsChangePercentage =
                previousProducts > 0
                    ? ((totalProducts - previousProducts) / previousProducts) *
                      100
                    : 0;

            return {
                totalSales: currentSales || 0,
                totalOrders,
                totalCustomers,
                totalProducts,
                salesChange: `${salesChangePercentage > 0 ? '+' : ''}${salesChangePercentage.toFixed(2)}%`,
                ordersChange: `${ordersChangePercentage > 0 ? '+' : ''}${ordersChangePercentage.toFixed(2)}%`,
                customersChange: `${customersChangePercentage > 0 ? '+' : ''}${customersChangePercentage.toFixed(2)}%`,
                productsChange: `${productsChangePercentage > 0 ? '+' : ''}${productsChangePercentage.toFixed(2)}%`,
            };
        } catch (error) {
            this.logger.error(
                `Error getting dashboard summary: ${error.message}`,
            );
            return {
                totalSales: 0,
                totalOrders: 0,
                totalCustomers: 0,
                totalProducts: 0,
                salesChange: '0%',
                ordersChange: '0%',
                customersChange: '0%',
                productsChange: '0%',
            };
        }
    }

    async getSalesData(period: string = 'week') {
        try {
            const now = new Date();
            let startDate: Date;
            let dateFormat: string;
            let groupByFormat: string;

            // Set the date range based on period
            switch (period) {
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year
                    dateFormat = '%Y-%m'; // YYYY-MM
                    groupByFormat = 'month';
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setDate(1); // 1st of current month
                    dateFormat = '%Y-%m-%d'; // YYYY-MM-DD
                    groupByFormat = 'day';
                    break;
                case 'week':
                default:
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 6); // Last 7 days
                    dateFormat = '%Y-%m-%d'; // YYYY-MM-DD
                    groupByFormat = 'day';
                    break;
            }

            // SQL query depends on your database, this example is for PostgreSQL
            // For real data from orders
            const salesData = await this.orderRepository
                .createQueryBuilder('order')
                .select(`TO_CHAR(order.created_at, '${dateFormat}')`, 'date')
                .addSelect('SUM(order.total)', 'sales')
                .where('order.created_at >= :startDate', { startDate })
                .andWhere('order.status IN (:...statuses)', {
                    statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
                })
                .groupBy('date')
                .orderBy('date', 'ASC')
                .getRawMany();

            // Format the data for the chart
            if (salesData && salesData.length > 0) {
                // Extract dates and sales from the query result
                const dates = salesData.map((item) => {
                    // Format date for display
                    if (period === 'year') {
                        const [year, month] = item.date.split('-');
                        const monthNames = [
                            'Jan',
                            'Feb',
                            'Mar',
                            'Apr',
                            'May',
                            'Jun',
                            'Jul',
                            'Aug',
                            'Sep',
                            'Oct',
                            'Nov',
                            'Dec',
                        ];
                        return monthNames[parseInt(month) - 1];
                    } else {
                        const date = new Date(item.date);
                        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                    }
                });

                const sales = salesData.map(
                    (item) => parseFloat(item.sales) || 0,
                );

                return { dates, sales };
            }

            // If no data, return format based on period
            if (period === 'year') {
                return {
                    dates: [
                        'Jan',
                        'Feb',
                        'Mar',
                        'Apr',
                        'May',
                        'Jun',
                        'Jul',
                        'Aug',
                        'Sep',
                        'Oct',
                        'Nov',
                        'Dec',
                    ],
                    sales: Array(12).fill(0),
                };
            } else if (period === 'month') {
                const daysInMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() + 1,
                    0,
                ).getDate();
                return {
                    dates: Array.from(
                        { length: daysInMonth },
                        (_, i) =>
                            `${(i + 1).toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`,
                    ),
                    sales: Array(daysInMonth).fill(0),
                };
            } else {
                // week
                const dates = [];
                const sales = Array(7).fill(0);

                for (let i = 6; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    dates.push(
                        `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`,
                    );
                }

                return { dates, sales };
            }
        } catch (error) {
            this.logger.error(`Error getting sales data: ${error.message}`);
            return { dates: [], sales: [] };
        }
    }

    async getProductCategories() {
        try {
            // Get total products count first
            const totalProductsCount = await this.productRepository.count();

            // Get actual product categories and counts from database - top 10 categories
            const categoriesData = await this.productRepository
                .createQueryBuilder('product')
                .select('product.category', 'category')
                .addSelect('COUNT(product.id)', 'count')
                .groupBy('product.category')
                .orderBy('count', 'DESC')
                .limit(10) // Top 10 categories
                .getRawMany();

            if (categoriesData && categoriesData.length > 0) {
                // Calculate sum of displayed categories
                const displayedCategoriesSum = categoriesData.reduce(
                    (sum, item) => sum + parseInt(item.count),
                    0,
                );

                // Calculate the difference between total and displayed categories
                const otherCategoriesCount =
                    totalProductsCount - displayedCategoriesSum;

                // Sort by count in descending order
                categoriesData.sort(
                    (a, b) => parseInt(b.count) - parseInt(a.count),
                );

                const categories = categoriesData.map((item) => item.category);
                const counts = categoriesData.map((item) =>
                    parseInt(item.count),
                );

                // Add "Other" category if there are products not in top categories
                if (otherCategoriesCount > 0) {
                    categories.push('Khác');
                    counts.push(otherCategoriesCount);
                }

                return {
                    categories,
                    counts,
                    totalCount: totalProductsCount,
                };
            }

            // Fallback to placeholder data if no real data
            return {
                categories: [
                    'Laptop',
                    'Desktop',
                    'Màn hình',
                    'CPU',
                    'GPU',
                    'Phụ kiện',
                ],
                counts: [0, 0, 0, 0, 0, 0],
                totalCount: 0,
            };
        } catch (error) {
            this.logger.error(
                `Error getting product categories: ${error.message}`,
            );
            return {
                categories: [],
                counts: [],
                totalCount: 0,
            };
        }
    }

    async getOrderStatuses() {
        try {
            // Get order counts by status
            const statusesData = await this.orderRepository
                .createQueryBuilder('order')
                .select('order.status', 'status')
                .addSelect('COUNT(order.id)', 'count')
                .groupBy('order.status')
                .orderBy('count', 'DESC')
                .getRawMany();

            if (statusesData && statusesData.length > 0) {
                // Map status to user-friendly names
                const statusMap = {
                    [OrderStatus.PENDING_APPROVAL]: 'Chờ duyệt',
                    [OrderStatus.APPROVED]: 'Đã duyệt',
                    [OrderStatus.PROCESSING]: 'Đang xử lý',
                    [OrderStatus.SHIPPING]: 'Đang giao hàng',
                    [OrderStatus.DELIVERED]: 'Đã giao hàng',
                    [OrderStatus.COMPLETED]: 'Hoàn thành',
                    [OrderStatus.CANCELLED]: 'Đã hủy',
                    [OrderStatus.PAYMENT_SUCCESS]: 'Thanh toán thành công',
                    [OrderStatus.PAYMENT_FAILURE]: 'Thanh toán thất bại',
                };

                // Sort by statuses in logical order
                const orderPriority = [
                    OrderStatus.PENDING_APPROVAL,
                    OrderStatus.APPROVED,
                    OrderStatus.PAYMENT_SUCCESS,
                    OrderStatus.PROCESSING,
                    OrderStatus.SHIPPING,
                    OrderStatus.DELIVERED,
                    OrderStatus.COMPLETED,
                    OrderStatus.PAYMENT_FAILURE,
                    OrderStatus.CANCELLED,
                ];

                statusesData.sort((a, b) => {
                    const indexA = orderPriority.indexOf(a.status);
                    const indexB = orderPriority.indexOf(b.status);
                    return indexA - indexB;
                });

                const statuses = statusesData.map(
                    (item) => statusMap[item.status] || item.status,
                );
                const counts = statusesData.map((item) => parseInt(item.count));

                return { statuses, counts };
            }

            // Fallback
            return {
                statuses: [
                    'Chờ duyệt',
                    'Đã duyệt',
                    'Đang xử lý',
                    'Đang giao hàng',
                    'Đã giao hàng',
                    'Đã hủy',
                ],
                counts: [0, 0, 0, 0, 0, 0],
            };
        } catch (error) {
            this.logger.error(`Error getting order statuses: ${error.message}`);
            return { statuses: [], counts: [] };
        }
    }

    // Add a method for customer growth chart
    async getCustomerGrowth(period: string = 'year') {
        try {
            const now = new Date();
            let startDate: Date;
            let dateFormat: string;

            switch (period) {
                case 'year':
                    startDate = new Date(now);
                    startDate.setFullYear(now.getFullYear() - 1);
                    dateFormat = '%Y-%m'; // YYYY-MM
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    dateFormat = '%Y-%m-%d'; // YYYY-MM-DD
                    break;
                case 'week':
                default:
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    dateFormat = '%Y-%m-%d'; // YYYY-MM-DD
                    break;
            }

            // Get customer signups grouped by date
            const customerData = await this.customerRepository
                .createQueryBuilder('customer')
                .select(`TO_CHAR(customer.created_at, '${dateFormat}')`, 'date')
                .addSelect('COUNT(customer.id)', 'count')
                .where('customer.created_at >= :startDate', { startDate })
                .groupBy('date')
                .orderBy('date', 'ASC')
                .getRawMany();

            if (customerData && customerData.length > 0) {
                const dates = customerData.map((item) => {
                    if (period === 'year') {
                        const [year, month] = item.date.split('-');
                        const monthNames = [
                            'Jan',
                            'Feb',
                            'Mar',
                            'Apr',
                            'May',
                            'Jun',
                            'Jul',
                            'Aug',
                            'Sep',
                            'Oct',
                            'Nov',
                            'Dec',
                        ];
                        return monthNames[parseInt(month) - 1];
                    } else {
                        const date = new Date(item.date);
                        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                    }
                });

                const counts = customerData.map((item) => parseInt(item.count));

                return { dates, counts };
            }

            // Fallback to empty data
            if (period === 'year') {
                return {
                    dates: [
                        'Jan',
                        'Feb',
                        'Mar',
                        'Apr',
                        'May',
                        'Jun',
                        'Jul',
                        'Aug',
                        'Sep',
                        'Oct',
                        'Nov',
                        'Dec',
                    ],
                    counts: Array(12).fill(0),
                };
            } else {
                // For week or month, return dates spanning the period
                return this.generateDateRange(startDate, now, period);
            }
        } catch (error) {
            this.logger.error(
                `Error getting customer growth: ${error.message}`,
            );
            return { dates: [], counts: [] };
        }
    }

    // Add a method for top selling products
    async getTopSellingProducts(limit: number = 10, period: string = 'month') {
        try {
            const now = new Date();
            let startDate: Date;

            switch (period) {
                case 'year':
                    startDate = new Date(now);
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'week':
                default:
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    break;
            }

            // Get top selling products based on order items
            const topProducts = await this.orderItemRepository
                .createQueryBuilder('orderItem')
                .leftJoinAndSelect('orderItem.product', 'product')
                .leftJoinAndSelect('orderItem.order', 'order')
                .select('product.id', 'id')
                .addSelect('product.name', 'name')
                .addSelect('SUM(orderItem.quantity)', 'quantity')
                .addSelect('SUM(orderItem.subPrice)', 'revenue')
                .where('order.created_at >= :startDate', { startDate })
                .andWhere('order.status IN (:...statuses)', {
                    statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
                })
                .groupBy('product.id')
                .addGroupBy('product.name')
                .orderBy('quantity', 'DESC')
                .limit(limit)
                .getRawMany();

            return {
                products: topProducts.map((p) => ({
                    id: p.id,
                    name: p.name,
                    quantity: parseInt(p.quantity),
                    revenue: parseFloat(p.revenue),
                })),
            };
        } catch (error) {
            this.logger.error(
                `Error getting top selling products: ${error.message}`,
            );
            return { products: [] };
        }
    }

    // Helper method to generate date ranges for charts
    private generateDateRange(startDate: Date, endDate: Date, period: string) {
        const dates = [];
        const counts = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            dates.push(
                `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`,
            );
            counts.push(0);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return { dates, counts };
    }

    async getRecentOrders(limit: number = 5) {
        try {
            const orders = await this.orderRepository.find({
                relations: ['customer'],
                order: { createdAt: 'DESC' },
                take: limit,
            });

            return {
                orders: orders.map((order) => ({
                    id: order.id,
                    orderNumber: order.orderNumber || `ORD-${order.id}`,
                    customerName: order.customer
                        ? `${order.customer.firstname} ${order.customer.lastname}`
                        : order.customerName || 'Guest',
                    total: parseFloat(order.total.toString()),
                    status: order.status,
                    date: order.createdAt,
                })),
            };
        } catch (error) {
            this.logger.error(`Error getting recent orders: ${error.message}`);
            return { orders: [] };
        }
    }
}
