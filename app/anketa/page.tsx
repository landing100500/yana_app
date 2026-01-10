'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';

interface AnketaData {
  gender: string | null;
  birthDate: string | null;
  birthCity: string | null;
  birthTime: string | null;
  name: string | null;
  motherJob: string | null;
  fatherJob: string | null;
  hasMoved: boolean | null;
  lifeDifficulties: string | null;
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

export default function AnketaPage() {
  const router = useRouter();
  const [stars, setStars] = useState<Star[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [anketaData, setAnketaData] = useState<AnketaData>({
    gender: null,
    birthDate: null,
    birthCity: null,
    birthTime: null,
    name: null,
    motherJob: null,
    fatherJob: null,
    hasMoved: null,
    lifeDifficulties: null,
  });

  // Создаем звезды для фона
  useEffect(() => {
    const newStars: Star[] = [];
    for (let i = 0; i < 50; i++) {
      newStars.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 5,
      });
    }
    setStars(newStars);
  }, []);

  const steps = [
    {
      id: 'gender',
      question: 'Ваш пол?',
      type: 'select',
      options: ['Мужской', 'Женский'],
      field: 'gender' as keyof AnketaData,
    },
    {
      id: 'birthDate',
      question: 'Дата рождения?',
      type: 'date',
      field: 'birthDate' as keyof AnketaData,
    },
    {
      id: 'birthCity',
      question: 'Город рождения?',
      type: 'text',
      field: 'birthCity' as keyof AnketaData,
    },
    {
      id: 'birthTime',
      question: 'Время рождения?',
      type: 'time-select',
      field: 'birthTime' as keyof AnketaData,
    },
  ];

  const parentSteps = [
    {
      id: 'motherJob',
      question: 'Кем работала мама?',
      type: 'text',
      field: 'motherJob' as keyof AnketaData,
    },
    {
      id: 'fatherJob',
      question: 'Кем работал папа?',
      type: 'text',
      field: 'fatherJob' as keyof AnketaData,
    },
    {
      id: 'hasMoved',
      question: 'Переезжали ли вы?',
      type: 'select',
      options: ['Да', 'Нет'],
      field: 'hasMoved' as keyof AnketaData,
    },
    {
      id: 'lifeDifficulties',
      question: 'Основные сложности в жизни?',
      type: 'textarea',
      field: 'lifeDifficulties' as keyof AnketaData,
    },
  ];

  const handleNext = () => {
    const question = getCurrentQuestion();
    const value = anketaData[question.field];

    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return;
    }

    // Если это вопрос о времени рождения и выбрано "Не знаю"
    if (question.id === 'birthTime' && value === 'unknown') {
      // Переходим к вопросу об имени (имя спрашиваем всегда)
      setCurrentStep(currentStep + 1);
      return;
    }

    // Если это вопрос о времени рождения и время указано
    if (question.id === 'birthTime' && value !== 'unknown') {
      // Переходим к вопросу об имени
      setCurrentStep(currentStep + 1);
      return;
    }

    // Если это вопрос об имени и время известно - завершаем
    if (question.id === 'name' && anketaData.birthTime && anketaData.birthTime !== 'unknown') {
      handleSubmit();
      return;
    }

    // Если это вопрос об имени и время неизвестно - переходим к вопросам о родителях
    if (question.id === 'name' && anketaData.birthTime === 'unknown') {
      setCurrentStep(currentStep + 1);
      return;
    }

    // Если это последний вопрос из родительских (когда время неизвестно)
    if (anketaData.birthTime === 'unknown' && currentStep === steps.length + 1 + parentSteps.length - 1) {
      handleSubmit();
      return;
    }

    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInputChange = (value: string | boolean) => {
    const question = getCurrentQuestion();
    
    setAnketaData((prev) => ({
      ...prev,
      [question.field]: value,
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      // Преобразуем hasMoved - он уже boolean или null
      const submitData = {
        ...anketaData,
        hasMoved: anketaData.hasMoved,
      };

      const response = await fetch('/api/anketa/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        throw new Error('Ошибка при сохранении анкеты');
      }

      router.push('/chat');
    } catch (error) {
      console.error('Error saving anketa:', error);
      alert('Произошла ошибка при сохранении данных. Попробуйте еще раз.');
      setIsLoading(false);
    }
  };

  const getCurrentQuestion = () => {
    // Основные вопросы (gender, birthDate, birthCity, birthTime)
    if (currentStep < steps.length) {
      return steps[currentStep];
    }
    
    // После основных вопросов всегда показываем вопрос об имени
    if (currentStep === steps.length) {
      return {
        id: 'name',
        question: 'Как к вам обращаться?',
        type: 'text',
        field: 'name' as keyof AnketaData,
      };
    }
    
    // Если время рождения неизвестно - показываем вопросы о родителях (после вопроса об имени)
    if (anketaData.birthTime === 'unknown') {
      const parentStepIndex = currentStep - steps.length - 1; // -1 для вопроса об имени
      if (parentStepIndex >= 0 && parentStepIndex < parentSteps.length) {
        return parentSteps[parentStepIndex];
      }
    }
    
    // Fallback - возвращаем последний основной вопрос
    return steps[steps.length - 1];
  };

  const renderInput = () => {
    const question = getCurrentQuestion();
    const value = anketaData[question.field];

    switch (question.type) {
      case 'select':
        return (
          <div className={styles.optionsContainer}>
            {question.options?.map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.optionButton} ${value === option ? styles.optionButtonActive : ''}`}
                onClick={() => {
                  if (question.field === 'hasMoved') {
                    handleInputChange(option === 'Да');
                  } else {
                    handleInputChange(option);
                  }
                }}
              >
                {option}
              </button>
            ))}
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            className={styles.input}
            value={value as string || ''}
            onChange={(e) => handleInputChange(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
        );

      case 'time':
        return (
          <input
            type="time"
            className={styles.input}
            value={value as string || ''}
            onChange={(e) => handleInputChange(e.target.value)}
          />
        );

      case 'time-select':
        return (
          <div className={styles.timeSelectContainer}>
            <input
              type="time"
              className={styles.input}
              value={value && value !== 'unknown' ? (value as string) : ''}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Введите время"
            />
            <div className={styles.orDivider}>или</div>
            <button
              type="button"
              className={`${styles.optionButton} ${value === 'unknown' ? styles.optionButtonActive : ''}`}
              onClick={() => handleInputChange('unknown')}
            >
              Не знаю
            </button>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            className={styles.textarea}
            value={value as string || ''}
            onChange={(e) => handleInputChange(e.target.value)}
            rows={4}
            placeholder="Опишите основные сложности..."
          />
        );

      default:
        return (
          <input
            type="text"
            className={styles.input}
            value={value as string || ''}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Введите ответ..."
          />
        );
    }
  };

  const question = getCurrentQuestion();
  const value = anketaData[question.field];
  
  // Вычисляем общее количество шагов
  // Имя спрашиваем всегда, поэтому +1 всегда
  const totalSteps = anketaData.birthTime === 'unknown' 
    ? steps.length + 1 + parentSteps.length  // +1 для вопроса об имени
    : steps.length + 1; // +1 для вопроса об имени
  
  const isLastStep = (anketaData.birthTime === 'unknown' && currentStep === steps.length + 1 + parentSteps.length - 1) ||
                     (anketaData.birthTime && anketaData.birthTime !== 'unknown' && question.id === 'name');
  
  const canProceed = value !== null && value !== '' && (typeof value !== 'string' || value.trim() !== '') &&
                     (typeof value !== 'boolean' || value !== null);

  return (
    <div className={styles.container}>
      <div className={styles.starsContainer}>
        {stars.map((star) => (
          <div
            key={star.id}
            className={styles.star}
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      <div className={styles.authCard}>
        <div className={styles.logoContainer}>
          <Image
            src="/logo/logo_big.png"
            alt="ЯСНА"
            width={240}
            height={96}
            className={styles.logo}
            priority
          />
        </div>

        <div className={styles.questionContainer}>
          <h2 className={styles.question}>{question.question}</h2>
          <div className={styles.inputContainer}>
            {renderInput()}
          </div>
        </div>

        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{
              width: `${((currentStep + 1) / totalSteps) * 100}%`
            }}
          />
        </div>

        <div className={styles.buttonsContainer}>
          {currentStep > 0 && (
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBack}
              disabled={isLoading}
            >
              Назад
            </button>
          )}
          <button
            type="button"
            className={styles.nextButton}
            onClick={handleNext}
            disabled={!canProceed || isLoading}
          >
            {isLoading ? (
              <span className={styles.loader}></span>
            ) : (
              isLastStep ? 'Завершить' : 'Далее'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
