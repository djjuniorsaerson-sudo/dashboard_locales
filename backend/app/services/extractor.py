from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta

class DataExtractor:
    @staticmethod
    def get_dashboard_metrics(db: Session, period: str = "today"):
        """
        Extrae las métricas principales del dashboard.
        """
        # Calcular fechas
        now = datetime.now()
        if period == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59)
        elif period == "week":
            start_date = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59)
        elif period == "month":
            start_date = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59)
        else:
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now.replace(hour=23, minute=59, second=59)

        # 1. Ventas Totales
        ventas_query = text("""
            SELECT COALESCE(SUM(total), 0) as total_ventas, COUNT(id) as total_operaciones
            FROM ventas
            WHERE created_at >= :start_date AND created_at <= :end_date
        """)
        ventas_result = db.execute(ventas_query, {"start_date": start_date, "end_date": end_date}).fetchone()
        
        # 2. Pedidos Activos (por ejemplo, status = 'pendiente', 'preparando', 'en_camino')
        # Buscamos cualquier pedido que no esté entregado o cancelado
        pedidos_query = text("""
            SELECT COUNT(id) as activos
            FROM pedidos
            WHERE status NOT IN ('entregado', 'cancelado', 'finalizado')
        """)
        pedidos_result = db.execute(pedidos_query).fetchone()

        # 3. Top Productos (vendidos en este periodo)
        top_productos_query = text("""
            SELECT product_name, SUM(quantity) as cantidad
            FROM detalle_pedidos dp
            JOIN pedidos p ON dp.order_id = p.id
            WHERE p.created_at >= :start_date AND p.created_at <= :end_date
            GROUP BY product_name
            ORDER BY cantidad DESC
            LIMIT 5
        """)
        top_productos_result = db.execute(top_productos_query, {"start_date": start_date, "end_date": end_date}).fetchall()
        
        # Top 5 formatted
        top_products = [{"name": row[0], "sales": int(row[1] or 0)} for row in top_productos_result]
        
        # Si no hay ventas, mostramos un gráfico base
        revenue_trend = []
        if period == "today":
            # Agrupar por hora
            trend_query = text("""
                SELECT EXTRACT(HOUR FROM created_at) as hora, SUM(total) as total
                FROM ventas
                WHERE created_at >= :start_date AND created_at <= :end_date
                GROUP BY hora
                ORDER BY hora
            """)
            trend_result = db.execute(trend_query, {"start_date": start_date, "end_date": end_date}).fetchall()
            revenue_trend = [{"time": f"{int(row[0])}:00", "amount": float(row[1] or 0)} for row in trend_result]
        elif period == "week":
            # Agrupar por día
            trend_query = text("""
                SELECT CAST(created_at AS DATE) as dia, SUM(total) as total
                FROM ventas
                WHERE created_at >= :start_date AND created_at <= :end_date
                GROUP BY dia
                ORDER BY dia
            """)
            trend_result = db.execute(trend_query, {"start_date": start_date, "end_date": end_date}).fetchall()
            revenue_trend = [{"time": str(row[0]), "amount": float(row[1] or 0)} for row in trend_result]
            
        return {
            "total_revenue": float(ventas_result[0] or 0),
            "total_orders": int(ventas_result[1] or 0),
            "active_orders": int(pedidos_result[0] or 0),
            "top_products": top_products,
            "revenue_trend": revenue_trend
        }
