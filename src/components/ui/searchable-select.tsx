// src/components/ui/searchable-select.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
    items: { value: string; label: string; }[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function SearchableSelect({ items, value, onValueChange, placeholder, disabled }: SearchableSelectProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    const selectedLabel = items.find((item) => item.value === value)?.label;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between px-3 py-2 h-auto border-gray-300",
                        !value && "text-muted-foreground",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                    disabled={disabled}
                >
                    {value ? selectedLabel : placeholder || t('registration.search.select_option', 'Select an option...')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white rounded-lg overflow-y-auto">
                <Command>
                    <CommandInput placeholder={placeholder || t('registration.search.placeholder', 'Search...')} />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty>{t('registration.search.no_results', 'No results found.')}</CommandEmpty>
                        <CommandGroup className='scrollable-true'>
                            {items.map((item) => (
                                <CommandItem
                                    key={item.value}
                                    value={item.label}
                                    className='hover:bg-gray-100 rounded-lg cursor-pointer'
                                    onSelect={(currentValue) => {
                                        const original = items.find((i) => i.label.toLowerCase() === currentValue.toLowerCase());
                                        onValueChange(original ? original.value : "");
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === item.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {item.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
