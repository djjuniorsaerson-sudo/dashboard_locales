from sqlalchemy.orm import Session
from sqlalchemy import text

class ModulesExtractor:
    @staticmethod
    def get_products(db: Session):
        query = text("""
            SELECT id, name, price, stock_quantity, batch_status
            FROM productos
            ORDER BY display_order ASC, name ASC
        """)
        productos_raw = db.execute(query).fetchall()
        
        # Toppings
        t_query = text("""
            SELECT pt.product_id, t.id, t.name, t.price 
            FROM productos_toppings pt
            JOIN toppings t ON pt.topping_id = t.id
            WHERE t.active = TRUE
        """)
        toppings_raw = db.execute(t_query).fetchall()
        
        # Topping Opciones
        to_query = text("""
            SELECT topping_id, label
            FROM topping_opciones
            WHERE active = TRUE
        """)
        topping_opc_raw = db.execute(to_query).fetchall()
        opciones_map = {}
        for r in topping_opc_raw:
            opciones_map.setdefault(r[0], []).append(r[1])
            
        toppings_map = {}
        for r in toppings_raw:
            pid = r[0]
            t_obj = {"id": r[1], "name": r[2], "price": float(r[3] or 0), "options": opciones_map.get(r[1], [])}
            toppings_map.setdefault(pid, []).append(t_obj)

        # Extras
        e_query = text("""
            SELECT pe.product_id, e.id, e.name, e.price 
            FROM productos_extras pe
            JOIN extras e ON pe.extra_id = e.id
            WHERE e.active = TRUE
        """)
        extras_raw = db.execute(e_query).fetchall()
        extras_map = {}
        for r in extras_raw:
            pid = r[0]
            e_obj = {"id": r[1], "name": r[2], "price": float(r[3] or 0)}
            extras_map.setdefault(pid, []).append(e_obj)

        # Guarniciones
        g_query = text("""
            SELECT pg.product_id, g.id, g.name, g.price 
            FROM productos_guarniciones pg
            JOIN guarniciones g ON pg.guarnicion_id = g.id
            WHERE g.active = TRUE
        """)
        guarniciones_raw = db.execute(g_query).fetchall()
        guarniciones_map = {}
        for r in guarniciones_raw:
            pid = r[0]
            g_obj = {"id": r[1], "name": r[2], "price": float(r[3] or 0)}
            guarniciones_map.setdefault(pid, []).append(g_obj)

        return [
            {
                "id": r[0],
                "name": r[1],
                "price": float(r[2] or 0),
                "stock": int(r[3] or 0),
                "active": r[4] != 'inactivo',
                "toppings": toppings_map.get(r[0], []),
                "extras": extras_map.get(r[0], []),
                "guarniciones": guarniciones_map.get(r[0], [])
            } for r in productos_raw
        ]

    @staticmethod
    def create_product(db: Session, data: dict):
        try:
            query = text("""
                INSERT INTO productos (
                    name, price, display_order, half_price, allows_half, simple_product,
                    additional_charge, image, stock_quantity, low_stock_threshold,
                    batch_status, cleaning_item, category_id
                ) VALUES (
                    :name, :price, 0, 0, FALSE, FALSE, FALSE, '', :stock, 5, 'correcto', FALSE, NULL
                ) RETURNING id
            """)
            result = db.execute(query, {
                "name": data.get("name"),
                "price": data.get("price", 0),
                "stock": data.get("stock", 0)
            })
            db.commit()
            return {"success": True, "id": result.scalar()}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def update_product(db: Session, product_id: int, data: dict):
        try:
            current = db.execute(text("SELECT name, stock_quantity FROM productos WHERE id = :id"), {"id": product_id}).fetchone()
            if not current:
                return {"success": False, "error": "Producto no encontrado"}
                
            current_name, current_stock = current[0], current[1]
            new_stock = data.get("stock", current_stock)
            new_price = data.get("price")
            new_name = data.get("name")
            
            update_q = text("""
                UPDATE productos 
                SET name = :name, price = :price, stock_quantity = :stock
                WHERE id = :id
            """)
            db.execute(update_q, {
                "name": new_name,
                "price": new_price,
                "stock": new_stock,
                "id": product_id
            })
            
            if new_stock != current_stock:
                diff = new_stock - current_stock
                move_q = text("""
                    INSERT INTO stock_movimientos (
                        product_id, product_name, movement_type, quantity, notes, created_at
                    ) VALUES (
                        :id, :name, 'ajuste', :qty, 'Ajuste desde dashboard externo', NOW()
                    )
                """)
                db.execute(move_q, {
                    "id": product_id,
                    "name": new_name,
                    "qty": diff
                })
                
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def update_product_stock(db: Session, product_id: int, new_stock: int):
        try:
            current = db.execute(text("SELECT name, stock_quantity FROM productos WHERE id = :id"), {"id": product_id}).fetchone()
            if not current:
                return {"success": False, "error": "Producto no encontrado"}
                
            current_name, current_stock = current[0], current[1]
            
            update_q = text("""
                UPDATE productos 
                SET stock_quantity = :stock
                WHERE id = :id
            """)
            db.execute(update_q, {
                "stock": new_stock,
                "id": product_id
            })
            
            if new_stock != current_stock:
                diff = new_stock - current_stock
                move_q = text("""
                    INSERT INTO stock_movimientos (
                        product_id, product_name, movement_type, quantity, notes, created_at
                    ) VALUES (
                        :id, :name, 'ajuste', :qty, 'Ajuste rápido desde dashboard', NOW()
                    )
                """)
                db.execute(move_q, {
                    "id": product_id,
                    "name": current_name,
                    "qty": diff
                })
                
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def reorder_products(db: Session, ordered_ids: list):
        try:
            for idx, pid in enumerate(ordered_ids):
                db.execute(text("UPDATE productos SET display_order = :order WHERE id = :id"), {"order": idx, "id": pid})
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def delete_product(db: Session, product_id: int):
        try:
            relations = ["productos_toppings", "productos_guarniciones", "productos_extras", "productos_estados"]
            for rel in relations:
                try:
                    db.execute(text(f"DELETE FROM {rel} WHERE product_id = :id"), {"id": product_id})
                except Exception:
                    pass
            
            db.execute(text("DELETE FROM productos WHERE id = :id"), {"id": product_id})
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_clients(db: Session):
        query = text("""
            SELECT id, name, phone, address, purchase_count, created_at
            FROM clientes
            ORDER BY purchase_count DESC, name ASC
        """)
        result = db.execute(query).fetchall()
        return [
            {
                "id": r[0],
                "name": r[1],
                "phone": r[2],
                "address": r[3],
                "purchase_count": int(r[4] or 0),
                "created_at": str(r[5]) if r[5] else None
            } for r in result
        ]

    @staticmethod
    def create_client(db: Session, data: dict):
        try:
            query = text("""
                INSERT INTO clientes (name, phone, address, notes, purchase_count, created_at)
                VALUES (:name, :phone, :address, :notes, 0, NOW())
                RETURNING id
            """)
            result = db.execute(query, {
                "name": data.get("name", ""),
                "phone": data.get("phone", ""),
                "address": data.get("address", ""),
                "notes": data.get("notes", "")
            })
            db.commit()
            return {"success": True, "id": result.scalar()}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def update_client(db: Session, client_id: int, data: dict):
        try:
            query = text("""
                UPDATE clientes
                SET name = :name, phone = :phone, address = :address, notes = :notes
                WHERE id = :id
            """)
            db.execute(query, {
                "name": data.get("name", ""),
                "phone": data.get("phone", ""),
                "address": data.get("address", ""),
                "notes": data.get("notes", ""),
                "id": client_id
            })
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def delete_client(db: Session, client_id: int):
        try:
            # Eliminar el cliente. La base de datos tiene ON DELETE SET NULL para pedidos.customer_id
            query = text("DELETE FROM clientes WHERE id = :id")
            db.execute(query, {"id": client_id})
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_employees(db: Session):
        try:
            query = text("SELECT id, name, role, salary_base FROM empleados ORDER BY id ASC")
            result = db.execute(query).fetchall()
            
            novedades_query = text("SELECT employee_id, SUM(amount) FROM empleado_novedades WHERE event_type ILIKE '%adelanto%' OR event_type ILIKE '%descuento%' OR event_type ILIKE '%falta%' GROUP BY employee_id")
            novedades_res = db.execute(novedades_query).fetchall()
            adelantos_map = {n[0]: float(n[1] or 0) for n in novedades_res}

            empleados = []
            for r in result:
                emp_id = r[0]
                salary = float(r[3] or 0)
                adelantos = adelantos_map.get(emp_id, 0.0)
                
                empleados.append({
                    "id": emp_id,
                    "name": r[1],
                    "role": r[2] if r[2] else "Staff",
                    "active": True,
                    "salary_base": salary,
                    "adelantos": adelantos,
                    "final_salary": salary - adelantos
                })
            return empleados
        except Exception as e:
            print("Error in get_employees:", str(e))
            return []

    @staticmethod
    def get_empleado_novedades(db: Session):
        try:
            query = text("""
                SELECT n.id, n.employee_id, e.name as employee_name, n.event_type, n.amount, n.notes, n.event_date
                FROM empleado_novedades n
                JOIN empleados e ON n.employee_id = e.id
                WHERE n.event_type ILIKE '%adelanto%' OR n.event_type ILIKE '%descuento%' OR n.event_type ILIKE '%falta%'
                ORDER BY n.event_date DESC, n.id DESC
                LIMIT 100
            """)
            result = db.execute(query).fetchall()
            return [
                {
                    "id": r[0],
                    "employee_id": r[1],
                    "employee_name": r[2],
                    "event_type": r[3],
                    "amount": float(r[4] or 0),
                    "notes": r[5] or "Sin motivo",
                    "event_date": str(r[6]) if r[6] else None
                } for r in result
            ]
        except Exception as e:
            print("Error in get_empleado_novedades:", str(e))
            return []

    @staticmethod
    def add_empleado_novedad(db: Session, employee_id: int, data: dict):
        try:
            event_type = data.get("event_type", "").lower()
            amount = data.get("amount", 0)
            notes = data.get("notes", "")
            
            insert_q = text("""
                INSERT INTO empleado_novedades (employee_id, event_type, amount, event_date, notes)
                VALUES (:emp_id, :event_type, :amount, NOW(), :notes)
            """)
            db.execute(insert_q, {
                "emp_id": employee_id,
                "event_type": event_type,
                "amount": amount,
                "notes": notes
            })
            
            if event_type == 'falta':
                update_q = text("""
                    UPDATE empleados
                    SET absences_count = COALESCE(absences_count, 0) + 1
                    WHERE id = :emp_id
                """)
                db.execute(update_q, {"emp_id": employee_id})
                
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_caja_movimientos(db: Session):
        # Mantenemos el historial plano por si acaso
        query = text("""
            SELECT id, movement_type, amount, payment_method, employee_name, notes, created_at
            FROM caja_movimientos
            ORDER BY created_at DESC
            LIMIT 100
        """)
        result = db.execute(query).fetchall()
        return [
            {
                "id": r[0],
                "type": r[1],
                "amount": float(r[2] or 0),
                "method": r[3],
                "employee": r[4],
                "notes": r[5],
                "date": str(r[6]) if r[6] else None
            } for r in result
        ]

    @staticmethod
    def get_caja_report(db: Session):
        # Extraemos los días únicos de movimientos y ventas
        try:
            days_query = text("""
                SELECT DISTINCT DATE(created_at) as d 
                FROM (
                    SELECT created_at FROM caja_movimientos
                    UNION
                    SELECT created_at FROM ventas
                ) t
                ORDER BY d DESC LIMIT 30
            """)
            days_res = db.execute(days_query).fetchall()
            
            report = []
            for day_row in days_res:
                day_str = str(day_row[0])
                
                # Movimientos del día ordenados cronológicamente
                mov_query = text("""
                    SELECT id, movement_type, amount, created_at, notes
                    FROM caja_movimientos
                    WHERE DATE(created_at) = :day
                    ORDER BY created_at ASC
                """)
                movs = db.execute(mov_query, {"day": day_str}).fetchall()
                
                # Ventas del día
                ventas_query = text("""
                    SELECT id, total, payment_method, created_at, payment_breakdown_json 
                    FROM ventas 
                    WHERE DATE(created_at) = :day
                    ORDER BY created_at ASC
                """)
                ventas = db.execute(ventas_query, {"day": day_str}).fetchall()
                
                shifts = []
                current_shift = {
                    "shift_id": 1,
                    "saldo_inicial": 0.0,
                    "ingresos": 0.0,
                    "salidas": 0.0,
                    "start_time": f"{day_str} 00:00:00",
                    "end_time": None,
                    "efectivo": 0.0,
                    "transferencia": 0.0,
                    "online": 0.0,
                    "debito": 0.0,
                    "mixto": 0.0,
                    "movimientos": []
                }
                
                shift_counter = 1
                last_time = current_shift["start_time"]
                
                # Procesamos movimientos (buscando los reset_turno)
                # Como combinamos con ventas, lo mejor es procesar todo ordenado por fecha
                all_events = []
                for m in movs:
                    all_events.append({"type": "mov", "time": str(m[3]), "data": m})
                for v in ventas:
                    all_events.append({"type": "venta", "time": str(v[3]), "data": v})
                    
                all_events.sort(key=lambda x: x["time"])
                
                for ev in all_events:
                    if ev["type"] == "mov":
                        m = ev["data"]
                        m_type = m[1]
                        amount = float(m[2] or 0)
                        current_shift["movimientos"].append({"type": m_type, "amount": amount, "time": str(m[3]), "notes": m[4]})
                        
                        if m_type == 'saldo_inicial':
                            current_shift["saldo_inicial"] += amount
                        elif m_type in ('retiro', 'vale', 'perdida'):
                            current_shift["salidas"] += amount
                        elif m_type == 'reset_turno':
                            current_shift["end_time"] = str(m[3])
                            shifts.append(current_shift)
                            shift_counter += 1
                            current_shift = {
                                "shift_id": shift_counter,
                                "saldo_inicial": 0.0,
                                "ingresos": 0.0,
                                "salidas": 0.0,
                                "start_time": str(m[3]),
                                "end_time": None,
                                "efectivo": 0.0,
                                "transferencia": 0.0,
                                "online": 0.0,
                                "debito": 0.0,
                                "mixto": 0.0,
                                "movimientos": []
                            }
                            last_time = str(m[3])
                    else:
                        v = ev["data"]
                        v_total = float(v[1] or 0)
                        v_method = (v[2] or "efectivo").lower()
                        v_breakdown = v[4] if len(v) > 4 else None
                        
                        current_shift["ingresos"] += v_total
                        
                        if "mixto" in v_method:
                            current_shift["mixto"] += v_total
                            if v_breakdown:
                                import json
                                try:
                                    bdown = json.loads(v_breakdown) if isinstance(v_breakdown, str) else v_breakdown
                                    current_shift["efectivo"] += float(bdown.get("efectivo", 0) or 0)
                                    current_shift["transferencia"] += float(bdown.get("transferencia", 0) or 0)
                                    current_shift["online"] += float(bdown.get("online", 0) or 0)
                                    current_shift["debito"] += float(bdown.get("debito", 0) or 0)
                                except Exception:
                                    pass
                        elif "online" in v_method:
                            current_shift["online"] += v_total
                        elif "debito" in v_method or "débito" in v_method:
                            current_shift["debito"] += v_total
                        elif "transferencia" in v_method or "mercado" in v_method:
                            current_shift["transferencia"] += v_total
                        else:
                            current_shift["efectivo"] += v_total
                
                # Añadir el último turno del día (puede estar abierto)
                current_shift["end_time"] = f"{day_str} 23:59:59"
                shifts.append(current_shift)
                
                # Totales del día
                day_ingresos = sum(s["ingresos"] for s in shifts)
                day_salidas = sum(s["salidas"] for s in shifts)
                day_efectivo = sum(s["efectivo"] for s in shifts)
                day_transf = sum(s["transferencia"] for s in shifts)
                day_online = sum(s["online"] for s in shifts)
                day_debito = sum(s["debito"] for s in shifts)
                day_mixto = sum(s["mixto"] for s in shifts)
                
                report.append({
                    "date": day_str,
                    "total_ingresos": day_ingresos,
                    "total_salidas": day_salidas,
                    "neto_dia": day_ingresos - day_salidas,
                    "efectivo": day_efectivo,
                    "transferencia": day_transf,
                    "online": day_online,
                    "debito": day_debito,
                    "mixto": day_mixto,
                    "shifts": shifts
                })
            
            return report
        except Exception as e:
            print("Error in get_caja_report:", str(e))
            return []

    @staticmethod
    def add_caja_movimiento(db: Session, data: dict):
        try:
            movement_type = data.get("movement_type")
            amount = data.get("amount", 0)
            payment_method = data.get("payment_method", "")
            movement_date = data.get("movement_date")
            employee_id = data.get("employee_id")
            employee_name = data.get("employee_name", "")
            notes = data.get("notes", "")
            source_type = data.get("source_type", "")
            source_id = data.get("source_id")

            query = text("""
                INSERT INTO caja_movimientos (
                    movement_type, amount, payment_method, movement_date,
                    employee_id, employee_name, notes, created_at, source_type, source_id
                ) VALUES (
                    :movement_type, :amount, :payment_method, :movement_date,
                    :employee_id, :employee_name, :notes, NOW(), :source_type, :source_id
                ) RETURNING id
            """)
            
            result = db.execute(query, {
                "movement_type": movement_type,
                "amount": amount,
                "payment_method": payment_method,
                "movement_date": movement_date,
                "employee_id": employee_id,
                "employee_name": employee_name,
                "notes": notes,
                "source_type": source_type,
                "source_id": source_id
            })
            db.commit()
            return {"success": True, "id": result.scalar()}
        except Exception as e:
            db.rollback()
            print("Error adding caja movimiento:", str(e))
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_repartidores(db: Session):
        query = text("""
            SELECT 
                r.id, 
                r.name, 
                r.shift_label, 
                r.is_active,
                COALESCE(SUM(v.total_amount), 0) as pending_cash,
                COUNT(v.id) as trips_count
            FROM repartidores r
            LEFT JOIN repartidor_viajes v ON r.id = v.repartidor_id AND v.status NOT IN ('rendido', 'liquidado', 'cancelado', 'settled')
            WHERE r.is_deleted = false
            GROUP BY r.id, r.name, r.shift_label, r.is_active
            ORDER BY r.name ASC
        """)
        result = db.execute(query).fetchall()
        return [
            {
                "id": r[0],
                "name": r[1],
                "shift": r[2] or 'Sin turno',
                "active": bool(r[3]),
                "pending_cash": float(r[4] or 0),
                "trips_count": int(r[5] or 0)
            } for r in result
        ]

    @staticmethod
    def search_client_by_phone(db: Session, phone: str):
        query = text("""
            SELECT id, name, phone, address, notes
            FROM clientes
            WHERE phone = :phone
            LIMIT 1
        """)
        r = db.execute(query, {"phone": phone}).fetchone()
        if r:
            return {
                "id": r[0],
                "name": r[1],
                "phone": r[2],
                "address": r[3],
                "notes": r[4]
            }
        return None

    @staticmethod
    def get_repartidor_history(db: Session, repartidor_id: int):
        query = text("""
            SELECT id, pedido_id, status, total_amount, address, notes, created_at, closed_at
            FROM repartidor_viajes
            WHERE repartidor_id = :r_id
            ORDER BY id DESC
            LIMIT 50
        """)
        try:
            result = db.execute(query, {"r_id": repartidor_id}).fetchall()
            return [
                {
                    "id": r[0],
                    "pedido_id": r[1],
                    "status": r[2],
                    "total_amount": float(r[3] or 0),
                    "address": r[4],
                    "notes": r[5],
                    "created_at": str(r[6]) if r[6] else None,
                    "closed_at": str(r[7]) if r[7] else None
                } for r in result
            ]
        except Exception:
            # Fallback if columns differ
            try:
                fallback_query = text("""
                    SELECT id, status, total_amount, created_at
                    FROM repartidor_viajes
                    WHERE repartidor_id = :r_id
                    ORDER BY id DESC
                    LIMIT 50
                """)
                result = db.execute(fallback_query, {"r_id": repartidor_id}).fetchall()
                return [
                    {
                        "id": r[0],
                        "pedido_id": None,
                        "status": r[1],
                        "total_amount": float(r[2] or 0),
                        "address": "",
                        "notes": "",
                        "created_at": str(r[3]) if len(r) > 3 and r[3] else None,
                        "closed_at": None
                    } for r in result
                ]
            except Exception:
                return []

    @staticmethod
    def get_global_repartidor_history(db: Session):
        try:
            # 1. Traer los viajes normales (Entregados o en curso)
            query_normales = text("""
                SELECT 
                    vp.id as unique_id,
                    vp.order_id as pedido_id,
                    p.status as pedido_status,
                    v.status as viaje_status,
                    p.total as total_amount,
                    p.customer_address as address,
                    p.customer_name as client_name,
                    v.notes as viaje_notes,
                    vp.created_at,
                    r.name as repartidor_name,
                    rf.name as from_repartidor_name
                FROM repartidor_viaje_pedidos vp
                JOIN repartidor_viajes v ON vp.viaje_id = v.id
                LEFT JOIN repartidores r ON v.repartidor_id = r.id
                LEFT JOIN pedidos p ON vp.order_id = p.id
                LEFT JOIN repartidor_reasignaciones rr ON rr.order_id = p.id AND rr.to_repartidor_id = v.repartidor_id
                LEFT JOIN repartidores rf ON rr.from_repartidor_id = rf.id
                ORDER BY vp.created_at DESC
                LIMIT 80
            """)
            res_normales = db.execute(query_normales).fetchall()
            
            # 2. Traer los viajes devueltos históricamente
            query_devueltos = text("""
                SELECT
                    rr.id as unique_id,
                    rr.order_id as pedido_id,
                    p.total as total_amount,
                    p.customer_address as address,
                    p.customer_name as client_name,
                    rr.reason as reason,
                    rr.created_at,
                    r.name as from_repartidor_name,
                    rt.name as to_repartidor_name
                FROM repartidor_reasignaciones rr
                LEFT JOIN pedidos p ON p.id = rr.order_id
                LEFT JOIN repartidores r ON r.id = rr.from_repartidor_id
                LEFT JOIN repartidores rt ON rt.id = rr.to_repartidor_id
                ORDER BY rr.created_at DESC
                LIMIT 50
            """)
            res_devueltos = db.execute(query_devueltos).fetchall()
            
            # 3. Combinar y formatear
            combined = []
            
            for r in res_normales:
                combined.append({
                    "id": f"trip_{r[0]}",
                    "pedido_id": r[1],
                    "status": r[2] if r[2] else r[3],
                    "total_amount": float(r[4] or 0),
                    "address": r[5] or "-",
                    "client_name": r[6] or "Sin nombre",
                    "notes": r[7] or "Sin motivo",
                    "created_at": str(r[8]) if r[8] else None,
                    "repartidor_name": r[9] or "Desconocido",
                    "from_repartidor_name": r[10] or "SISTEMA"
                })
                
            for r in res_devueltos:
                combined.append({
                    "id": f"dev_{r[0]}",
                    "pedido_id": r[1],
                    "status": "devuelto", # FORZAMOS ESTADO DEVUELTO PARA EL FRONTEND
                    "total_amount": float(r[2] or 0),
                    "address": r[3] or "-",
                    "client_name": r[4] or "Sin nombre",
                    "notes": r[5] or "Reasignado",
                    "created_at": str(r[6]) if r[6] else None,
                    "repartidor_name": r[8] or "SISTEMA", # A quien se asigno
                    "from_repartidor_name": r[7] or "SISTEMA" # De quien vino
                })
                
            # Ordenar por fecha descendente
            combined.sort(key=lambda x: x["created_at"] or "", reverse=True)
            return combined[:100]

        except Exception as e:
            db.rollback()
            print("Error in global history:", str(e))
            return []

    @staticmethod
    def get_dashboard_metrics(db: Session):
        try:
            # Ventas Turno
            ventas_query = text("""
                WITH ultimo_reset AS (
                    SELECT created_at
                    FROM caja_movimientos
                    WHERE movement_date = CURRENT_DATE::text
                      AND movement_type = 'reset_turno'
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                )
                SELECT COALESCE(SUM(v.total), 0) AS total_vendido_turno
                FROM ventas v
                WHERE (
                    EXISTS (SELECT 1 FROM ultimo_reset)
                    AND v.created_at >= (SELECT created_at FROM ultimo_reset)
                    AND v.created_at <= NOW()
                )
                OR (
                    NOT EXISTS (SELECT 1 FROM ultimo_reset)
                    AND DATE(v.created_at) = CURRENT_DATE
                )
            """)
            ventas_res = db.execute(ventas_query).fetchone()
            total_vendido = float(ventas_res[0] or 0)

            # Activos
            activos_query = text("""
                SELECT COUNT(*) AS pedidos_activos
                FROM pedidos
                WHERE archived = FALSE
                  AND status IN ('Pendiente', 'Preparando', 'Listo')
            """)
            activos_res = db.execute(activos_query).fetchone()
            pedidos_activos = int(activos_res[0] or 0)

            # Entregados
            finalizados_query = text("""
                SELECT COUNT(*) AS pedidos_finalizados
                FROM pedidos
                WHERE archived = FALSE
                  AND status = 'Entregado'
            """)
            finalizados_res = db.execute(finalizados_query).fetchone()
            pedidos_finalizados = int(finalizados_res[0] or 0)

            # Stock Actual
            stock_query = text("""
                SELECT id, name, COALESCE(stock_quantity, 0) as stock
                FROM productos
                ORDER BY stock ASC
            """)
            stock_res = db.execute(stock_query).fetchall()
            stock_levels = [{"id": r[0], "name": r[1], "stock": float(r[2])} for r in stock_res]

            # Productos Vendidos (Día vs Turno)
            sold_query = text("""
                WITH ultimo_reset AS (
                    SELECT created_at
                    FROM caja_movimientos
                    WHERE movement_date = CURRENT_DATE::text
                      AND movement_type = 'reset_turno'
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ),
                ventas_turno AS (
                    SELECT v.order_id
                    FROM ventas v
                    WHERE (
                        EXISTS (SELECT 1 FROM ultimo_reset)
                        AND v.created_at >= (SELECT created_at FROM ultimo_reset)
                        AND v.created_at <= NOW()
                    )
                    OR (
                        NOT EXISTS (SELECT 1 FROM ultimo_reset)
                        AND DATE(v.created_at) = CURRENT_DATE
                    )
                ),
                ventas_dia AS (
                    SELECT order_id
                    FROM ventas
                    WHERE DATE(created_at) = CURRENT_DATE
                ),
                vendidos_turno AS (
                    SELECT dp.product_name, SUM(dp.quantity) AS qty
                    FROM detalle_pedidos dp
                    JOIN ventas_turno vt ON vt.order_id = dp.order_id
                    GROUP BY dp.product_name
                ),
                vendidos_dia AS (
                    SELECT dp.product_name, SUM(dp.quantity) AS qty
                    FROM detalle_pedidos dp
                    JOIN ventas_dia vd ON vd.order_id = dp.order_id
                    GROUP BY dp.product_name
                )
                SELECT 
                    COALESCE(vd.product_name, vt.product_name) as name,
                    COALESCE(vt.qty, 0) as sold_turno,
                    COALESCE(vd.qty, 0) as sold_dia
                FROM vendidos_dia vd
                FULL OUTER JOIN vendidos_turno vt ON vt.product_name = vd.product_name
                ORDER BY sold_turno DESC, name ASC
            """)
            sold_res = db.execute(sold_query).fetchall()
            product_sales = [{"name": r[0], "sold_turno": float(r[1]), "sold_dia": float(r[2])} for r in sold_res]

            return {
                "ventas_turno": total_vendido,
                "pedidos_activos": pedidos_activos,
                "pedidos_finalizados": pedidos_finalizados,
                "stock_levels": stock_levels,
                "product_sales": product_sales
            }

        except Exception as e:
            print("Error in get_dashboard_metrics:", str(e))
            return {
                "ventas_turno": 0,
                "pedidos_activos": 0,
                "pedidos_finalizados": 0,
                "stock_levels": [],
                "product_sales": []
            }

    @staticmethod
    def get_usuarios(db: Session):
        try:
            query = text("""
                SELECT id, username, role, active, created_at, last_login_at, empleado_id
                FROM usuarios
                ORDER BY created_at DESC
            """)
            result = db.execute(query).fetchall()
            return [
                {
                    "id": r[0],
                    "username": r[1],
                    "role": r[2],
                    "active": bool(r[3]),
                    "created_at": str(r[4]) if r[4] else None,
                    "last_login_at": str(r[5]) if r[5] else None,
                    "empleado_id": r[6]
                } for r in result
            ]
        except Exception as e:
            print("Error in get_usuarios:", str(e))
            return []

    @staticmethod
    def create_usuario(db: Session, data: dict):
        try:
            import bcrypt
            password = data.get("password", "")
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
            
            query = text("""
                INSERT INTO usuarios (
                    username, password_hash, role, active, created_at, force_password_change
                ) VALUES (
                    :username, :password_hash, :role, :active, NOW(), FALSE
                ) RETURNING id
            """)
            result = db.execute(query, {
                "username": data.get("username"),
                "password_hash": hashed,
                "role": data.get("role", "cajero"),
                "active": data.get("active", True)
            })
            db.commit()
            return {"success": True, "id": result.scalar()}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def update_usuario_password(db: Session, user_id: int, new_password: str):
        try:
            import bcrypt
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')
            
            query = text("""
                UPDATE usuarios
                SET password_hash = :password_hash, updated_at = NOW()
                WHERE id = :id
            """)
            db.execute(query, {"password_hash": hashed, "id": user_id})
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def toggle_usuario_status(db: Session, user_id: int, active: bool):
        try:
            query = text("""
                UPDATE usuarios
                SET active = :active, updated_at = NOW()
                WHERE id = :id
            """)
            db.execute(query, {"active": active, "id": user_id})
            db.commit()
            return {"success": True}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_audit_logs(db: Session, limit: int = 100):
        try:
            query = text("""
                SELECT id, created_at, actor_username, actor_role, module_name, action_name, 
                       entity_type, entity_id, ip_address, terminal_name, payload_json,
                       request_method, request_path
                FROM system_access_audit_logs
                ORDER BY created_at DESC
                LIMIT :limit
            """)
            result = db.execute(query, {"limit": limit}).fetchall()
            return [
                {
                    "id": r[0],
                    "created_at": str(r[1]) if r[1] else None,
                    "actor_username": r[2],
                    "actor_role": r[3],
                    "module_name": r[4],
                    "action_name": r[5],
                    "entity_type": r[6],
                    "entity_id": str(r[7]),
                    "ip_address": r[8],
                    "terminal_name": r[9],
                    "payload_json": r[10],
                    "request_method": r[11],
                    "request_path": r[12]
                } for r in result
            ]
        except Exception as e:
            print("Error in get_audit_logs:", str(e))
            return []

    @staticmethod
    def get_active_pedidos(db: Session):
        try:
            query = text("""
                SELECT id, status, customer_name, order_type, created_at, notes, total, payment_method, archived
                FROM pedidos
                ORDER BY created_at ASC
            """)
            res = db.execute(query).fetchall()
            
            pedidos = []
            for r in res:
                # Add safety checks
                if r[1] not in ('Pendiente', 'Preparando', 'Listo'):
                    continue
                    
                pid = r[0]
                status = r[1]
                
                # Fetch items
                items_query = text("""
                    SELECT product_name, quantity, price
                    FROM detalle_pedidos
                    WHERE pedido_id = :pid
                """)
                items_res = db.execute(items_query, {"pid": pid}).fetchall()
                
                # Assume Prioritario for all since we don't know the schema perfectly
                items = [{"name": i[0], "product_name": i[0], "quantity": int(i[1] or 1), "price": float(i[2] or 0), "routing_type": "Prioritario"} for i in items_res]
                
                # Format to match frontend expectations
                pedidos.append({
                    "id": pid,
                    "state": status,
                    "status": status,
                    "total": float(r[6] or 0),
                    "payment_method": r[7] or "",
                    "client_name": r[2] or "",
                    "customer_name": r[2] or "",
                    "order_type": r[3] or "mostrador",
                    "created_at": str(r[4]) if r[4] else None,
                    "order_time": str(r[4]) if r[4] else None,
                    "notes": r[5] or "",
                    "archived": False,
                    "items": items,
                    "kitchen_tickets": {
                        "kitchen1": {
                            "visible": True,
                            "status": "active",
                            "items": [item for item in items if item["routing_type"] != 'Secundario']
                        },
                        "kitchen2": {
                            "visible": True,
                            "status": "active",
                            "items": [item for item in items if item["routing_type"] == 'Secundario']
                        }
                    }
                })
            return pedidos
        except Exception as e:
            print("Error getting active pedidos:", e)
            return []

