"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useBreadcrumbs } from "@/lib/hooks/useBreadcrumbs";

interface PageHeaderProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      {/* Breadcrumbs */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          {breadcrumbs.map((item, index) => (
            <div key={item.href} className="contents">
              <BreadcrumbItem>
                {item.isCurrentPage ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Title and Description */}
      {(title || description || children) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {title && (
              <h1 className="text-2xl md:text-3xl font-bold text-slate-100">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-sm md:text-base text-slate-400 mt-1">
                {description}
              </p>
            )}
          </div>
          {children && <div className="flex items-center gap-3">{children}</div>}
        </div>
      )}
    </motion.div>
  );
}
