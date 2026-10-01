import '@expo/metro-runtime'

import { App } from 'expo-router/build/qualified-entry'
import { renderRootComponent } from 'expo-router/build/renderRootComponent'
import { registerWidgetTaskHandler } from 'react-native-android-widget'

import { widgetTaskHandler } from '@/src/widgets/widget-task-handler'
import { registerHabitNudgeTask } from '@/src/lib/habitNudges'

renderRootComponent(App)
registerWidgetTaskHandler(widgetTaskHandler)
registerHabitNudgeTask()
