import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';
import { parseDateSafe, formatToDDMMYYYY } from '../utils/date';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPicker({
  value,
  onSelect,
  onClose,
  title = 'Select Date',
}) {
  const [selectedDate, setSelectedDate] = useState(() => parseDateSafe(value));
  const [viewYear, setViewYear] = useState(() => parseDateSafe(value).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseDateSafe(value).getMonth());
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);

  useEffect(() => {
    const parsed = parseDateSafe(value);
    setSelectedDate(parsed);
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
    setShowMonthYearPicker(false);
  }, [value]);

  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const selYear = selectedDate.getFullYear();
  const selMonth = selectedDate.getMonth();
  const selDay = selectedDate.getDate();

  const daysInMonth = useMemo(() => {
    return new Date(viewYear, viewMonth + 1, 0).getDate();
  }, [viewYear, viewMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).getDay();
  }, [viewYear, viewMonth]);

  // Generate Year options (spanning 40 years into past to 30 years into future)
  const yearOptions = useMemo(() => {
    const startYear = Math.min(viewYear - 25, todayYear - 30);
    const endYear = Math.max(viewYear + 25, todayYear + 25);
    const years = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return years;
  }, [viewYear, todayYear]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handlePrevYear = () => {
    setViewYear((y) => y - 1);
  };

  const handleNextYear = () => {
    setViewYear((y) => y + 1);
  };

  const handleSelectDay = (dayNum) => {
    const newDate = new Date(viewYear, viewMonth, dayNum);
    setSelectedDate(newDate);
  };

  const handleSelectToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setShowMonthYearPicker(false);
  };

  const handleConfirm = () => {
    const formatted = formatToDDMMYYYY(selectedDate);
    onSelect(formatted);
  };

  const selectedFormatted = formatToDDMMYYYY(selectedDate);
  const selectedDisplayHeader = `${DAY_NAMES[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTH_SHORT[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.dark || '#4B6B4E'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={colors.muted || '#4B5563'} />
        </TouchableOpacity>
      </View>

      {/* Selected Date Preview Bar */}
      <View style={styles.previewBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.previewSub}>Selected Date (DD-MM-YYYY)</Text>
          <Text style={styles.previewDateText}>{selectedDisplayHeader}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{selectedFormatted}</Text>
        </View>
      </View>

      {/* Month & Year Navigation Bar */}
      <View style={styles.navBar}>
        <View style={styles.navArrowsGroup}>
          <TouchableOpacity onPress={handlePrevYear} style={styles.navArrowBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="play-back" size={14} color={colors.dark || '#4B6B4E'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="chevron-back" size={18} color={colors.dark || '#4B6B4E'} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.monthYearSelectorBtn}
          onPress={() => setShowMonthYearPicker(!showMonthYearPicker)}
          activeOpacity={0.7}
        >
          <Text style={styles.monthYearText}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <Ionicons
            name={showMonthYearPicker ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.dark || '#4B6B4E'}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        <View style={styles.navArrowsGroup}>
          <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="chevron-forward" size={18} color={colors.dark || '#4B6B4E'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNextYear} style={styles.navArrowBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="play-forward" size={14} color={colors.dark || '#4B6B4E'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Fast Month & Year Picker Overlay */}
      {showMonthYearPicker ? (
        <View style={styles.fastPickerContainer}>
          <Text style={styles.fastPickerSectionTitle}>Select Month</Text>
          <View style={styles.monthsGrid}>
            {MONTH_SHORT.map((mName, mIdx) => {
              const isCurrentViewMonth = mIdx === viewMonth;
              return (
                <TouchableOpacity
                  key={mName}
                  style={[
                    styles.monthChip,
                    isCurrentViewMonth && styles.monthChipActive,
                  ]}
                  onPress={() => setViewMonth(mIdx)}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      isCurrentViewMonth && styles.monthChipTextActive,
                    ]}
                  >
                    {mName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fastPickerSectionTitle, { marginTop: 10 }]}>Select Year (Past, Present & Future)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.yearsRow}
            style={{ maxHeight: 42, marginVertical: 4 }}
          >
            {yearOptions.map((y) => {
              const isCurrentViewYear = y === viewYear;
              return (
                <TouchableOpacity
                  key={y}
                  style={[
                    styles.yearChip,
                    isCurrentViewYear && styles.yearChipActive,
                  ]}
                  onPress={() => setViewYear(y)}
                >
                  <Text
                    style={[
                      styles.yearChipText,
                      isCurrentViewYear && styles.yearChipTextActive,
                    ]}
                  >
                    {y}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.donePickerBtn}
            onPress={() => setShowMonthYearPicker(false)}
          >
            <Text style={styles.donePickerBtnText}>Show Calendar Days</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Normal Calendar Grid */
        <View style={styles.calendarContainer}>
          <View style={styles.weekdaysRow}>
            {DAY_NAMES.map((dName, idx) => (
              <View key={dName} style={styles.dayCellWrapper}>
                <Text style={[styles.weekdayText, (idx === 0 || idx === 6) && styles.weekendText]}>
                  {dName}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <View key={`empty-${idx}`} style={styles.dayCellWrapper} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const isSelected =
                selYear === viewYear &&
                selMonth === viewMonth &&
                selDay === dayNum;
              const isToday =
                todayYear === viewYear &&
                todayMonth === viewMonth &&
                todayDay === dayNum;

              return (
                <TouchableOpacity
                  key={`day-${dayNum}`}
                  style={styles.dayCellWrapper}
                  onPress={() => handleSelectDay(dayNum)}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.dayCell,
                      isToday && !isSelected && styles.todayCell,
                      isSelected && styles.selectedCell,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && !isSelected && styles.todayText,
                        isSelected && styles.selectedText,
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={handleSelectToday}
        >
          <Ionicons name="today-outline" size={15} color={colors.dark || '#4B6B4E'} />
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>

        <View style={styles.actionRightButtons}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
            <Ionicons name="checkmark" size={16} color={colors.white} />
            <Text style={styles.confirmBtnText}>Apply Date</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: {
    padding: 4,
    borderRadius: 8,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.dark || '#4B6B4E',
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
  },
  previewBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  previewSub: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: '#15803D',
  },
  previewDateText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: '#14532D',
    marginTop: 1,
  },
  badge: {
    backgroundColor: '#15803D',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
    letterSpacing: 0.5,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  navArrowsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  navArrowBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  monthYearSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  monthYearText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.dark || '#4B6B4E',
  },
  calendarContainer: {
    marginBottom: 8,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 6,
    marginBottom: 4,
  },
  weekdayText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted || '#4B5563',
    textAlign: 'center',
  },
  weekendText: {
    color: '#9CA3AF',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellWrapper: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
  },
  dayCell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: colors.dark || '#4B6B4E',
    backgroundColor: '#F0FDF4',
  },
  todayText: {
    fontFamily: fonts.bold,
    color: colors.dark || '#4B6B4E',
  },
  selectedCell: {
    backgroundColor: colors.dark || '#4B6B4E',
    shadowColor: colors.dark || '#4B6B4E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedText: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  fastPickerContainer: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  fastPickerSectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  monthChip: {
    width: '23%',
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChipActive: {
    backgroundColor: colors.dark || '#4B6B4E',
  },
  monthChipText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.text,
  },
  monthChipTextActive: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  yearsRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
  yearChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearChipActive: {
    backgroundColor: colors.dark || '#4B6B4E',
  },
  yearChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
  },
  yearChipTextActive: {
    fontFamily: fonts.bold,
    color: colors.white,
  },
  donePickerBtn: {
    marginTop: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  donePickerBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.dark || '#4B6B4E',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  todayBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.dark || '#4B6B4E',
  },
  actionRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.dark || '#4B6B4E',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  confirmBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.white,
  },
});
