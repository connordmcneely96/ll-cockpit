                if mode == "standard":
                    if (agent, task_type) in PRODUCTION_LOCKED:
                        log.info(f"SKIP [{agent}/{task_type}] — production locked"); continue
                    if (agent, task_type) not in ACTIVE_TEST_SLOTS:
                        log.info(f"SKIP [{agent}/{task_type}] — not active"); continue
                else:  # premium: test all slots except broken quality floor and already-converged
                    if agent == "META_COGNITION":
                        log.info(f"SKIP [{agent}/{task_type}] — quality floor broken, skip premium"); continue
                    ps = d1.query_rows(
                        "SELECT status FROM premium_routing WHERE agent=? AND task_type=? AND quality_tier='premium'",
                        [agent, task_type])
                    if ps and ps[0].get("status") == "converged":
                        log.info(f"SKIP [{agent}/{task_type}] — premium already converged"); continue
