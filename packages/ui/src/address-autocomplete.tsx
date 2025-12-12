"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];

export interface AddressComponents {
  formatted: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: AddressComponents) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  apiKey?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onInputChange,
  placeholder = "Enter your address",
  className = "",
  required = false,
  apiKey,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Use provided apiKey or fall back to env variable
  const googleMapsApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries,
  });

  const onLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();

      if (place.address_components && place.formatted_address) {
        const components = place.address_components;

        const getComponent = (type: string): string => {
          const component = components.find(c => c.types.includes(type));
          return component?.long_name || "";
        };

        const getComponentShort = (type: string): string => {
          const component = components.find(c => c.types.includes(type));
          return component?.short_name || "";
        };

        const streetNumber = getComponent("street_number");
        const route = getComponent("route");
        const city = getComponent("locality") || getComponent("sublocality") || getComponent("administrative_area_level_2");
        const state = getComponentShort("administrative_area_level_1");
        const zip = getComponent("postal_code");

        const address: AddressComponents = {
          formatted: place.formatted_address,
          street: streetNumber ? `${streetNumber} ${route}` : route,
          city,
          state,
          zip,
          placeId: place.place_id,
        };

        setInputValue(place.formatted_address);
        onChange(address);
      }
    }
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onInputChange?.(e.target.value);
  };

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  if (loadError) {
    // Fallback to regular input if Google Maps fails to load
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  if (!isLoaded) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Loading..."
        className={className}
        disabled
      />
    );
  }

  return (
    <Autocomplete
      onLoad={onLoad}
      onPlaceChanged={onPlaceChanged}
      options={{
        componentRestrictions: { country: "us" },
        types: ["address"],
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    </Autocomplete>
  );
}
