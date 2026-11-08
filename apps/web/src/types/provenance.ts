/**
 * Data Provenance & Authoritative Data Sources Types for LumenOS.
 */

export type DataProvenanceCategory =
  | "REAL_NASA_REFERENCE"
  | "SIMULATED_SPACECRAFT"
  | "SIMULATED_ENVIRONMENT"
  | "MODEL_PREDICTION";

export interface DataProvenanceMetadata {
  provenance_type: DataProvenanceCategory;
  source_id: string;
  product_name: string;
  provider: string;
  attribution_label: string;
  is_authoritative: boolean;
  educational_disclaimer: string;
  timestamp_utc?: string;
  quality_flag?: string;
  confidence_pct?: number;
}

export interface DataSourceRecord {
  source_id: string;
  name: string;
  agency: string;
  product_code: string;
  product_version: string;
  temporal_coverage: string;
  spatial_coverage: string;
  units: Record<string, string>;
  quality_flags: string[];
  update_method: string;
  api_requirements: string;
  license_and_terms: string;
  processing_steps: string[];
  gameplay_role: string;
  fallback_strategy: string;
  verification_status: "verified" | "planned" | "assumed";
  reference_url: string;
  offline_file: string;
}

export interface ApiStatusResponse {
  mode: string;
  offline_bundle_available: boolean;
  offline_datasets_loaded: string[];
  credentials: Record<
    string,
    {
      configured: boolean;
      status: string;
      note: string;
    }
  >;
}

